package es.thor.showdown;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Showdown Thor · fase 1
 *
 * Showdown a pantalla completa, con el estilo v2 y el script del mando metidos,
 * la sesión guardada, la pantalla encendida y el mando leído por Android.
 */
public class MainActivity extends Activity {

    private static final String TAG = "ShowdownThor";
    static final String START_URL = "https://play.pokemonshowdown.com/";

    /** Webs que se abren dentro de la app. El resto (Smogon, etc.) va al navegador. */
    private static final Set<String> HOSTS_DENTRO = new HashSet<>(Arrays.asList(
            "play.pokemonshowdown.com", "psim.us"));
    /** Dónde se meten el estilo y el script (como los @match del script). */
    private static final Set<String> ORIGENES = new HashSet<>(Arrays.asList(
            "https://play.pokemonshowdown.com", "https://psim.us", "https://*.psim.us"));

    private FrameLayout root;
    private WebView web;
    private GamepadBridge pad;
    private WebAssets.Bundle assets;
    private boolean docStartScripts;
    private boolean offline;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView.setWebContentsDebuggingEnabled(true);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0x14, 0x1a, 0x30));
        setContentView(root);
        hideSystemBars();

        // Teclado en pantalla: que no tape lo que escribes.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
            v.setPadding(0, 0, 0, ime);
            return insets;
        });

        pad = new GamepadBridge(this);

        // Bajar estilo y script (como mucho unos segundos) y luego abrir Showdown.
        new Thread(() -> {
            WebAssets.Bundle b = WebAssets.load(getApplicationContext());
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                assets = b;
                createWebView();
                web.loadUrl(START_URL);
            });
        }, "thor-assets").start();
    }

    /* ------------------------------------------------------------------ */
    /*  WebView                                                            */
    /* ------------------------------------------------------------------ */

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0x14, 0x1a, 0x30));
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // ajustes y equipos de Showdown
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);                    // que el tamaño de letra de Android no descoloque nada
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " ShowdownThor/" + versionName());

        // Sesión guardada: cookies permanentes.
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(pad, "ThorPad");

        // Lo más fiable: meter el puente, el estilo y el script desde el primer instante.
        docStartScripts = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (docStartScripts) {
            WebViewCompat.addDocumentStartJavaScript(web, assets.puente, ORIGENES);
            WebViewCompat.addDocumentStartJavaScript(web, WebAssets.styleInjector(assets.css.text), ORIGENES);
            WebViewCompat.addDocumentStartJavaScript(web, WebAssets.mandoInjector(assets.mando.text), ORIGENES);
        }
        Log.i(TAG, "inyección al empezar la página: " + docStartScripts);

        web.setWebViewClient(new Cliente());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, "web: " + m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        web.requestFocus();
    }

    private final class Cliente extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            String host = u.getHost() == null ? "" : u.getHost();
            if ("https".equals(scheme) && (HOSTS_DENTRO.contains(host) || host.endsWith(".psim.us"))) {
                return false;   // se queda en la app
            }
            abrirFuera(u);
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            CookieManager.getInstance().flush();
            // WebView antiguo sin inyección al empezar: lo metemos ahora (cada script se protege de ir dos veces).
            if (!docStartScripts && !offline && esShowdown(url)) {
                view.evaluateJavascript(assets.puente, null);
                view.evaluateJavascript(WebAssets.styleInjector(assets.css.text), null);
                view.evaluateJavascript(WebAssets.mandoInjector(assets.mando.text), null);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (req.isForMainFrame()) mostrarSinConexion();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // Si el motor de la web se cae, montamos uno nuevo en vez de cerrar la app.
            Log.w(TAG, "el motor web se cayó; se vuelve a abrir");
            root.removeView(web);
            web.destroy();
            web = null;
            createWebView();
            web.loadUrl(START_URL);
            return true;
        }
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private static boolean esShowdown(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        String host = u.getHost() == null ? "" : u.getHost();
        return HOSTS_DENTRO.contains(host) || host.endsWith(".psim.us");
    }

    private void abrirFuera(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "nada puede abrir " + u);
        }
    }

    private void mostrarSinConexion() {
        offline = true;
        String html = "<!doctype html><html><head><meta name=viewport content='width=device-width'>"
                + "<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#141a30;color:#e9edf4;font:600 22px system-ui,sans-serif;text-align:center}"
                + "b{display:inline-block;background:#f2c84b;color:#1a2343;border-radius:999px;padding:2px 14px}"
                + "button{margin-top:22px;font:inherit;background:#1f2945;color:#e9edf4;border:2px solid #2c3656;"
                + "border-radius:999px;padding:10px 28px}</style></head><body><div>"
                + "No hay conexión con Showdown.<br><br>Pulsa <b>A</b> para reintentar"
                + "<br><button onclick=\"location.href='" + START_URL + "'\">Reintentar</button>"
                + "</div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private void reintentar() {
        offline = false;
        web.loadUrl(START_URL);
    }

    /* ------------------------------------------------------------------ */
    /*  Mando                                                              */
    /* ------------------------------------------------------------------ */

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();

        // Atrás (B del mando si llega así, o el gesto de Android): nunca cierra la app.
        if (code == KeyEvent.KEYCODE_BACK) {
            if (offline) {
                if (e.getAction() == KeyEvent.ACTION_UP) reintentar();
            } else {
                pad.pressBack(e.getAction());
            }
            return true;
        }

        if (offline && GamepadBridge.buttonFor(code) == GamepadBridge.BTN_A) {
            if (e.getAction() == KeyEvent.ACTION_UP) reintentar();
            return true;
        }

        if (pad.handleKey(e)) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (pad.handleMotion(e)) return true;
        return super.dispatchGenericMotionEvent(e);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Nada: la app no se cierra con atrás (para salir, botón de inicio de Android).
    }

    /* ------------------------------------------------------------------ */
    /*  Pantalla completa y ciclo de vida                                  */
    /* ------------------------------------------------------------------ */

    private void hideSystemBars() {
        getWindow().setDecorFitsSystemWindows(false);
        WindowInsetsController c = getWindow().getInsetsController();
        if (c != null) {
            c.hide(WindowInsets.Type.systemBars());
            c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        pad.refreshConnected();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();   // guardar la sesión
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
