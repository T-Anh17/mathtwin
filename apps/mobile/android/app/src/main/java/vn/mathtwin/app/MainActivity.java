package vn.mathtwin.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MathTwinPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
