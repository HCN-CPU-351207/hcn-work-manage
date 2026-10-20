package __PACKAGE__;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin riêng của HCN phải đăng ký trước super.onCreate
        registerPlugin(HcnNetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
