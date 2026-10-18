package com.pocketledger.local;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILE = 11, SAVE_FILE = 12;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingExport;
    private volatile boolean pickerOpen = false;
    private long pickerStarted = 0;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(245, 246, 241));
        setContentView(web);
        // Keep content away from system bars on Android 15's edge-to-edge windows.
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Content URI files explicitly chosen in the system picker.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSaveFormData(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) {
                    WebResourceResponse response = loader.shouldInterceptRequest(uri);
                    if (response != null) {
                        if (uri.getPath() != null && uri.getPath().endsWith(".wasm")) response.setMimeType("application/wasm");
                        if (uri.getPath() != null && (uri.getPath().endsWith(".js") || uri.getPath().endsWith(".mjs"))) response.setMimeType("text/javascript");
                        return response;
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"https".equals(request.getUrl().getScheme()) || !HOST.equals(request.getUrl().getHost());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pickerOpen = true;
                pickerStarted = System.currentTimeMillis();
                try { startActivityForResult(pick, PICK_FILE); }
                catch (ActivityNotFoundException error) {
                    pickerOpen = false; fileCallback.onReceiveValue(null); fileCallback = null;
                    Toast.makeText(MainActivity.this, "No file picker is available.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });
        web.addJavascriptInterface(new FileBridge(), "AndroidBridge");
        web.loadUrl("https://" + HOST + "/assets/www/index.html");
    }

    private final class FileBridge {
        @JavascriptInterface public boolean isFilePickerOpen() { return pickerOpen; }
        @JavascriptInterface public void saveFile(String filename, String mime, String content) {
            if (content == null || content.length() > 60 * 1024 * 1024) return;
            runOnUiThread(() -> {
                if (pickerOpen || pendingExport != null) return;
                pendingExport = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json".equals(mime) ? "application/json" : "text/csv");
                intent.putExtra(Intent.EXTRA_TITLE, filename.replaceAll("[^a-zA-Z0-9._-]", "_"));
                pickerOpen = true;
                pickerStarted = System.currentTimeMillis();
                try { startActivityForResult(intent, SAVE_FILE); }
                catch (ActivityNotFoundException error) {
                    pickerOpen = false; pendingExport = null;
                    Toast.makeText(MainActivity.this, "No file picker is available.", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        boolean expired = System.currentTimeMillis() - pickerStarted > 5 * 60 * 1000;
        pickerOpen = false;
        if (request == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(!expired && result == RESULT_OK && data != null && data.getData() != null
                ? new Uri[]{data.getData()} : null);
            fileCallback = null;
        }
        if (request == SAVE_FILE) {
            String text = pendingExport;
            pendingExport = null;
            if (!expired && result == RESULT_OK && data != null && data.getData() != null && text != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (output == null) throw new java.io.IOException("No output stream");
                    output.write(text.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "File saved.", Toast.LENGTH_SHORT).show();
                } catch (Exception error) {
                    Toast.makeText(this, "Could not save the file. Try another location.", Toast.LENGTH_LONG).show();
                }
            }
        }
        if (expired) lockLedger();
    }
    private void lockLedger() {
        if (web != null) web.evaluateJavascript("window.pocketLedgerLock && window.pocketLedgerLock()", null);
    }
    @Override protected void onPause() {
        if (!pickerOpen) lockLedger();
        super.onPause();
    }
    @Override public void onBackPressed() { lockLedger(); super.onBackPressed(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        pendingExport = null;
        if (web != null) { web.removeJavascriptInterface("AndroidBridge"); web.destroy(); }
        super.onDestroy();
    }
}
