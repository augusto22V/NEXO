package com.softsys.lanapp;

import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupBackNavigationHandler();
        enableImmersiveMode();
    }

    @Override
    public void onResume() {
        super.onResume();
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void setupBackNavigationHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge != null ? bridge.getWebView() : null;

                if (webView == null) {
                    showExitConfirmation();
                    return;
                }

                String currentUrl = webView.getUrl();

                // Home se comporta como raiz: no volver a login, confirmar salida.
                if (isHomeUrl(currentUrl)) {
                    showExitConfirmation();
                    return;
                }

                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                showExitConfirmation();
            }
        });
    }

    private boolean isHomeUrl(String url) {
        if (url == null) return false;
        return url.contains("/home.html") || url.endsWith("/home") || url.endsWith("/home/");
    }

    private void showExitConfirmation() {
        String appName = getString(R.string.app_name);
        new AlertDialog.Builder(MainActivity.this)
                .setTitle("Salir de " + appName)
                .setMessage("Deseas cerrar la aplicacion?")
                .setCancelable(true)
                .setNegativeButton("Cancelar", (dialog, which) -> dialog.dismiss())
                .setPositiveButton("Salir", (dialog, which) -> finishAffinity())
                .show();
    }

    private void enableImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        if (controller == null) {
            return;
        }

        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        controller.hide(
                WindowInsetsCompat.Type.statusBars() |
                WindowInsetsCompat.Type.navigationBars()
        );
    }
}
