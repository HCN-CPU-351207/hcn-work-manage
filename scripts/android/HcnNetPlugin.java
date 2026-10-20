package __PACKAGE__;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Enumeration;

/**
 * HCN: liệt kê địa chỉ IPv4 của các card mạng đang bật (wlan0 = Wi-Fi, rndis0/ncm0 = chia sẻ qua USB,
 * bt-pan = chia sẻ qua Bluetooth, ap0/swlan0 = điểm phát) để app quét đúng dải mạng tìm PC.
 * Android 11+ chọn dải ngẫu nhiên cho USB/Bluetooth nên không đoán trước được.
 */
@CapacitorPlugin(name = "HcnNet")
public class HcnNetPlugin extends Plugin {

    @PluginMethod
    public void localAddresses(PluginCall call) {
        JSArray list = new JSArray();
        try {
            Enumeration<NetworkInterface> all = NetworkInterface.getNetworkInterfaces();
            if (all != null) {
                for (NetworkInterface ni : Collections.list(all)) {
                    try {
                        if (!ni.isUp() || ni.isLoopback()) continue;
                    } catch (Exception ignored) {
                        continue;
                    }
                    for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                        InetAddress a = ia.getAddress();
                        if (!(a instanceof Inet4Address)) continue;
                        JSObject o = new JSObject();
                        o.put("name", ni.getName());
                        o.put("address", a.getHostAddress());
                        o.put("prefix", (int) ia.getNetworkPrefixLength());
                        list.put(o);
                    }
                }
            }
        } catch (Exception e) {
            call.reject("net: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("list", list);
        call.resolve(ret);
    }
}
