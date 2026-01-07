import threading
from collections import deque
from datetime import datetime
from urllib.parse import urlparse
import paho.mqtt.client as mqtt

class MqttClient:
    def __init__(self):
        #self.client = mqtt.Client()
        #switch to (if you use it with paho 2.0>)
        self.client = mqtt.Client(
           callback_api_version=mqtt.CallbackAPIVersion.VERSION1
        )
        self.connected = False
        self.last_error = None
        self._connect_event = threading.Event()
        self._subscriptions = set()
        self._logs_lock = threading.Lock()
        self._logs = {
            "sent": deque(maxlen=200),
            "received": deque(maxlen=200),
        }

    def connect_url(self, url, keepalive=60):
        parsed = urlparse(url if "://" in url else f"mqtt://{url}")
        host = parsed.hostname
        port = parsed.port or 1883
        if not host:
            raise ValueError("Broker address required")

        self._connect_event.clear()
        self.connected = False
        self.last_error = None
        self._subscriptions.clear()
        with self._logs_lock:
            self._logs["sent"].clear()
            self._logs["received"].clear()

        def on_connect(client, userdata, flags, rc):
            self.connected = rc == 0
            self.last_error = None if self.connected else mqtt.connack_string(rc)
            self._connect_event.set()

        def on_message(client, userdata, msg):
            payload = msg.payload.decode(errors="ignore").strip()
            self._append_log("received", topic=msg.topic, payload=payload)

            # === obsługa CPU temperature ===
            if msg.topic == "device/cpu/temperature" and payload.lower() == "read":
                temp = self.read_cpu_temperature()
                if temp is not None:
                    client.publish(msg.topic, f"{temp:.2f} °C")
                    self._append_log("sent", topic=msg.topic, payload=f"{temp:.2f} °C")
                else:
                    client.publish(msg.topic, "Error reading CPU temp")
                    self._append_log("sent", topic=msg.topic, payload="Error reading CPU temp")

        self.client.on_connect = on_connect
        self.client.on_message = on_message
        self.client.connect(host, port, keepalive)
        self.client.loop_start()

        self._connect_event.wait(timeout=3)
        if not self.connected:
            self.client.loop_stop()
            raise ConnectionError(self.last_error or "Unable to connect")
        return True

    def publish(self, topic, message):
        if self.connected:
            self.client.publish(topic, message)
            self._append_log("sent", topic=topic, payload=message)
        else:
            raise RuntimeError("MQTT client not connected")

    def subscribe(self, topic):
        if not topic:
            raise ValueError("Topic required")
        if not self.connected:
            raise RuntimeError("MQTT client not connected")
        result, _ = self.client.subscribe(topic)
        if result != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"Subscribe failed ({result})")
        self._subscriptions.add(topic)
        return list(self._subscriptions)

    def list_subscriptions(self):
        return list(self._subscriptions)

    def get_logs(self):
        with self._logs_lock:
            return {
                "sent": list(self._logs["sent"]),
                "received": list(self._logs["received"]),
            }

    def _append_log(self, direction, topic, payload):
        entry = {
            "topic": topic,
            "payload": payload,
            "time": datetime.utcnow().isoformat() + "Z",
        }
        with self._logs_lock:
            self._logs[direction].appendleft(entry)

    # function to read cpu temperatures
    def read_cpu_temperature(self):
        try:
            with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                temp_millic = int(f.read().strip())
            return temp_millic / 1000.0  # °C
        except Exception as e:
            self.last_error = str(e)
            return None