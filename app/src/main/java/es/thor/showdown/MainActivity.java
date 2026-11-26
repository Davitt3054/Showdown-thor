package es.thor.showdown;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.Context;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.TextView;

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
    private TextView cargando;
    private WebView web;
    private GamepadBridge pad;
    private WebAssets.Bundle assets;
    private boolean docStartScripts;
    private boolean offline;

    // Pantalla de abajo (fase 3)
    private DisplayManager pantallas;
    private volatile PantallaAbajo abajo;
    private boolean enPrimerPlano;
    private final Handler hilo = new Handler(Looper.getMainLooper());
    private final Runnable reintentarAbajo = this::mostrarAbajo;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView.setWebContentsDebuggingEnabled(true);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0x14, 0x1a, 0x30));
        setContentView(root);
        hideSystemBars();

        // Mientras se baja el estilo (unos segundos como mucho).
        cargando = new TextView(this);
        cargando.setText("SHOWDOWN THOR\ncargando…");
        cargando.setTextColor(Color.rgb(0xe9, 0xed, 0xf4));
        cargando.setTextSize(22);
        cargando.setGravity(Gravity.CENTER);
        cargando.setLineSpacing(0, 1.3f);
        root.addView(cargando, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Teclado en pantalla: que no tape lo que escribes.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
            v.setPadding(0, 0, 0, ime);
            return insets;
        });

        pad = new GamepadBridge(this);
        pantallas = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);

        // Bajar estilo y script (como mucho unos segundos) y luego abrir Showdown.
        new Thread(() -> {
            WebAssets.Bundle b = WebAssets.load(getApplicationContext());
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                assets = b;
                root.removeView(cargando);
                createWebView();
                web.loadUrl(START_URL);
                mostrarAbajo();
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
        // El estilo y el script son para el cliente NUEVO de Showdown. Sin esta
        // cookie Showdown da el cliente viejo (Firefox ya la tenía guardada).
        cm.setCookie("https://play.pokemonshowdown.com",
                "preactalpha=1; Max-Age=31536000; Path=/; Secure");

        web.addJavascriptInterface(pad, "ThorPad");
        web.addJavascriptInterface(new PuenteArriba(), "ThorDos");

        // Lo más fiable: meter el puente, el estilo y el script desde el primer instante.
        docStartScripts = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (docStartScripts) {
            WebViewCompat.addDocumentStartJavaScript(web, assets.preparar, ORIGENES);
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
                view.evaluateJavascript(assets.preparar, null);
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
        if (manejarTecla(e)) return true;
        return super.dispatchKeyEvent(e);
    }

    /** El mando (y "atrás"), venga de la pantalla de arriba o de la de abajo. */
    boolean manejarTecla(KeyEvent e) {
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

        return pad.handleKey(e);
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
        enPrimerPlano = true;
        pantallas.registerDisplayListener(oyentePantallas, hilo);
        mostrarAbajo();
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();   // guardar la sesión
        if (web != null) web.onPause();
        enPrimerPlano = false;
        pantallas.unregisterDisplayListener(oyentePantallas);
        ocultarAbajo();
        super.onPause();
    }

    /* ------------------------------------------------------------------ */
    /*  Pantalla de abajo (fase 3)                                         */
    /* ------------------------------------------------------------------ */

    private final DisplayManager.DisplayListener oyentePantallas = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) { mostrarAbajo(); }
        @Override public void onDisplayChanged(int id) { mostrarAbajo(); }
        @Override public void onDisplayRemoved(int id) {
            if (abajo != null && abajo.getDisplay().getDisplayId() == id) ocultarAbajo();
        }
    };

    /** La pantalla de abajo de la Thor: la que no es la principal (1240×1080 si la hay). */
    private Display buscarPantallaAbajo() {
        Display otra = null;
        for (Display d : pantallas.getDisplays()) {
            if (d.getDisplayId() == Display.DEFAULT_DISPLAY) continue;
            if ((d.getFlags() & Display.FLAG_PRESENTATION) == 0 && (d.getFlags() & Display.FLAG_PRIVATE) != 0) continue;
            Display.Mode m = d.getMode();
            int w = m.getPhysicalWidth(), h = m.getPhysicalHeight();
            if ((w == 1240 && h == 1080) || (w == 1080 && h == 1240)) return d;
            if (otra == null) otra = d;
        }
        return otra;
    }

    private void mostrarAbajo() {
        hilo.removeCallbacks(reintentarAbajo);
        if (!enPrimerPlano || isFinishing() || assets == null || web == null) return;
        if (abajo != null && abajo.isShowing()) return;
        Display d = buscarPantallaAbajo();
        if (d == null) return;   // Thor sin segunda pantalla (o en otro modo): todo sigue arriba
        PantallaAbajo p = new PantallaAbajo(this, d, assets.abajo.text, new PantallaAbajo.Oyente() {
            @Override public boolean tecla(KeyEvent e) { return manejarTecla(e); }
            @Override public boolean movimiento(MotionEvent e) { return pad.handleMotion(e); }
            @Override public void haciaArriba(String json) { runOnUiThread(() -> mensajeDeAbajo(json)); }
            @Override public void abrirFuera(Uri u) { runOnUiThread(() -> MainActivity.this.abrirFuera(u)); }
        });
        p.setOnDismissListener(di -> {
            if (abajo == p) abajo = null;
            avisarArriba();
        });
        try {
            p.show();
            abajo = p;
            Log.i(TAG, "pantalla de abajo: " + d.getName());
        } catch (WindowManager.InvalidDisplayException | WindowManager.BadTokenException ex) {
            Log.w(TAG, "no se pudo abrir la pantalla de abajo: " + ex);
            abajo = null;
            hilo.postDelayed(reintentarAbajo, 1000);
        }
        avisarArriba();
    }

    private void ocultarAbajo() {
        hilo.removeCallbacks(reintentarAbajo);
        if (abajo != null) {
            PantallaAbajo p = abajo;
            abajo = null;
            try { p.dismiss(); } catch (Exception ignored) { }
        }
    }

    /** Le dice al script de arriba si hay pantalla de abajo (para que mande todo de nuevo). */
    private void avisarArriba() {
        if (web == null) return;
        web.evaluateJavascript("window.__thor && __thor.abajoCambia && __thor.abajoCambia(" + (abajo != null) + ")", null);
    }

    private void mensajeDeAbajo(String json) {
        if (web == null) return;
        web.evaluateJavascript("window.__thor && __thor.recibe && __thor.recibe(" + org.json.JSONObject.quote(json) + ")", null);
    }

    /** Lo que el script de arriba puede usar para hablar con la pantalla de abajo. */
    private final class PuenteArriba {
        @JavascriptInterface
        public boolean hayAbajo() {
            return abajo != null;
        }

        @JavascriptInterface
        public void enviar(final String json) {
            runOnUiThread(() -> { if (abajo != null) abajo.haciaAbajo(json); });
        }
    }

    @Override
    protected void onDestroy() {
        ocultarAbajo();
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
