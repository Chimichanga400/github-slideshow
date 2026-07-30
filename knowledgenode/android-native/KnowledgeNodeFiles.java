package app.knowledgenode.study;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * KnowledgeNodeFiles — native file save + print bridge.
 *
 * The Android WebView can't honour <a download>, navigator.share, or
 * window.open()/window.print(). This bridge writes files to the public
 * Downloads folder (via MediaStore) and prints HTML through Android's
 * PrintManager (which offers "Save as PDF" with proper system back support).
 *
 * JS API (window.KnowledgeNodeFiles):
 *   saveToDownloads(filename, mimeType, base64) → writes file, fires events
 *   printHtml(html, jobName)                    → opens native print/PDF dialog
 *
 * Events on window:
 *   knfiles:saved  detail = filename
 *   knfiles:error  detail = reason
 */
public class KnowledgeNodeFiles {
    private final Context context;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView printWebView; // kept alive while a print job is set up

    public KnowledgeNodeFiles(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
    }

    /**
     * Strip directory components and unsafe characters from a JS-supplied name so
     * the bridge can never be coaxed into path traversal or writing a hidden file
     * outside the Downloads collection.
     */
    private static String sanitizeFilename(String name) {
        if (name == null || name.trim().isEmpty()) return "knowledgenode-export";
        String base = name.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) base = base.substring(slash + 1);          // keep only the base name
        base = base.replaceAll("[\\x00-\\x1f<>:\"/\\\\|?*]", "_").trim();
        while (base.startsWith(".")) base = base.substring(1);     // no leading dots ("..", hidden)
        if (base.isEmpty()) base = "knowledgenode-export";
        if (base.length() > 120) base = base.substring(0, 120);
        return base;
    }

    @JavascriptInterface
    public void saveToDownloads(final String rawFilename, final String mime, final String base64) {
        main.post(() -> {
            try {
                final String filename = sanitizeFilename(rawFilename);
                final byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                final String type = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = context.getContentResolver();
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    cv.put(MediaStore.Downloads.MIME_TYPE, type);
                    cv.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) { fire("knfiles:error", "insert_failed"); return; }
                    try (OutputStream os = resolver.openOutputStream(uri)) {
                        if (os == null) { fire("knfiles:error", "stream_failed"); return; }
                        os.write(bytes);
                    }
                    cv.clear();
                    cv.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(uri, cv, null, null);
                    fire("knfiles:saved", filename);
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    File out = new File(dir, filename);
                    try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(bytes); }
                    fire("knfiles:saved", filename);
                }
            } catch (Exception e) {
                fire("knfiles:error", e.getMessage() == null ? "save_failed" : e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void printHtml(final String html, final String jobName) {
        main.post(() -> {
            try {
                final WebView pw = new WebView(context);
                pw.getSettings().setJavaScriptEnabled(false);
                pw.setWebViewClient(new WebViewClient() {
                    @Override public void onPageFinished(WebView view, String url) {
                        try {
                            PrintManager pm = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
                            String job = (jobName == null || jobName.isEmpty()) ? "KnowledgeNode" : jobName;
                            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(job);
                            PrintAttributes attrs = new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .build();
                            if (pm != null) pm.print(job, adapter, attrs);
                            else fire("knfiles:error", "no_print_service");
                        } catch (Exception e) {
                            fire("knfiles:error", "print_failed");
                        }
                    }
                });
                printWebView = pw; // hold a reference so it isn't collected mid-job
                pw.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                fire("knfiles:error", "print_failed");
            }
        });
    }

    private void fire(final String event, final String detail) {
        final String safe = (detail == null ? "" : detail)
                .replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ");
        main.post(() -> webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('" + event + "',{detail:'" + safe + "'}))", null));
    }
}
