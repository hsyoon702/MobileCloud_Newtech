package com.example.yunhongseog.callapp;

import android.os.Bundle;
import android.support.v7.app.AppCompatActivity;
import android.widget.Button;


public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        Button bt1 = (Button) findViewById(R.id.button1);
        bt1.setText("바로전화걸기");
        Button bt2 = (Button) findViewById(R.id.button2);
        bt2.setText("다이얼로표시");

//        bt1.setOnClickListener(this);
//        bt2.setOnClickListener(this);
    }

}
