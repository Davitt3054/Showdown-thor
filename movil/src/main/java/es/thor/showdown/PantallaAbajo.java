package es.thor.showdown;

import android.annotation.SuppressLint;
import android.app.Presentation;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Display;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * Pantalla de ABAJO de la Thor (fase 3): calculadora, rival, equipo y chat.
 *
 * Es una "Presentation" de Android (una ventana en la segunda pantalla) con
 * su propio WebView, que carga abajo.html. No habla con Showdown: lo que
 * enseña se lo manda el script de arriba, y lo que tocas (pestañas, chat...)
 * se lo devuelve. El mando que llegue aquí se reenvía a la pantalla de arriba.
 */
final class PantallaAbajo extends Presentation {

    private static final String TAG = "ShowdownThor";
    /** Dirección "falsa" desde la que se sirve abajo.html y la calculadora (de dentro de la app). */
    static final String BASE = "https://appassets.androidplatform.net/";

    interface Oyente {
        boolean tecla(KeyEvent e);
        boolean movimiento(MotionEvent e);
        /** Mensaje (JSON) de la página de abajo para el script de arriba. */
        void haciaArriba(String json);
        void abrirFuera(Uri u);
    }

    private final String html;
    private final Oyente oyente;
    private WebView web;
    private WebViewAssetLoader cargador;

    PantallaAbajo(Context ctx, Display display, String html, Oyente oyente) {
        super(ctx, display);
        this.html = html;
        this.oyente = oyente;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setCancelable(false);
        Window w = getWindow();
        if (w != null) {
            w.clearFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
            w.setDimAmount(0f);
            w.setBackgroundDrawableResource(R.color.fondo);
        }

        cargador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(getContext()))
                .build();

        web = new WebView(getContext());
        web.setBackgroundColor(Color.rgb(0x14, 0x1a, 0x30));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new Puente(), "ThorDos");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return cargador.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                oyente.abrirFuera(req.getUrl());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, "abajo: " + m.message() + " (" + m.lineNumber() + ")");
                return true;
            }
        });
        setContentView(web);
        ocultarBarras();
        web.loadDataWithBaseURL(BASE, html, "text/html", "UTF-8", null);
    }

    private void ocultarBarras() {
        Window w = getWindow();
        if (w == null) return;
        w.setDecorFitsSystemWindows(false);
        WindowInsetsController c = w.getInsetsController();
        if (c != null) {
            c.hide(WindowInsets.Type.systemBars());
            c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) ocultarBarras();
    }

    /** Mensaje (JSON) del script de arriba para la página de abajo. */
    void haciaAbajo(String json) {
        if (web == null) return;
        web.evaluateJavascript("window.thorRecibe && thorRecibe(" + org.json.JSONObject.quote(json) + ")", null);
    }

    // El mando también puede llegar a esta ventana (si tocaste abajo): se reenvía arriba.
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (oyente.tecla(e)) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (oyente.movimiento(e)) return true;
        return super.dispatchGenericMotionEvent(e);
    }

    @Override
    protected void onStop() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onStop();
    }

    /** Lo que la página de abajo puede pedir. */
    private final class Puente {
        @JavascriptInterface
        public void enviar(String json) {
            oyente.haciaArriba(json);
        }
    }
}
