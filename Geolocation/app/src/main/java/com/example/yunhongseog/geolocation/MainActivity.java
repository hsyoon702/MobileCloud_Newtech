package com.example.yunhongseog.geolocation;

import android.content.Intent;
import android.graphics.Bitmap;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Environment;
import android.support.v7.app.AppCompatActivity;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends AppCompatActivity {
    public static String sdPath;
    public static String myPath;
    WebView mWebView;    // 웹뷰 선언

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        MainActivity activity = new MainActivity();
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        String ext = Environment.getExternalStorageState();
        if(ext.equals(Environment.MEDIA_MOUNTED)) {

            sdPath = Environment.getExternalStorageDirectory().getAbsolutePath();
        } else {

            sdPath = Environment.MEDIA_UNMOUNTED;
        }
        myPath = sdPath + "/NateOn/NateOn_download/index.html";
        checkGPS();
        mWebView = (WebView) findViewById(R.id.WebView1);
        mWebView.getSettings().setJavaScriptEnabled(true);      // 웹뷰에서 자바 스크립트 사용

        mWebView.setWebViewClient(new MyWebView() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                // TODO Auto-generated method stub
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // TODO Auto-generated method stub
                super.onPageFinished(view, url);
            }
        });

        mWebView.loadUrl("https://hshs-hsyoon702.c9users.io/hello-world.html");            // 웹뷰에서 불러올 URL 입력

    }

    public class MyWebView extends WebViewClient {
        public boolean shouldOver(WebView view, String url) {
            view.loadUrl(url);
            return true;
        }
    }

    public boolean checkGPS() {
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        boolean isGPS = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        if (isGPS) {
            return true;
        } else {
            Toast.makeText(MainActivity.this, "GPS 사용을 체크해주세요 .", Toast.LENGTH_LONG).show();
            startActivityForResult(new Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS), 0);
        }
        return false;
    }
}
