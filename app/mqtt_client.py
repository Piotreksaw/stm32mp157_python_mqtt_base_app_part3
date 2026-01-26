import threading
import platform
import random
from collections import deque
from datetime import datetime
from urllib.parse import urlparse
import paho.mqtt.client as mqtt

class MqttClient:
    def __init__(self):
        # Paho MQTT 2.0.0 introduced CallbackAPIVersion.
        # We detect if it exists to support both 1.x and 2.x versions.
        if hasattr(mqtt, "CallbackAPIVersion"):
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION1
            )
        else:
            self.client = mqtt.Client()

        self.connected = False
        self.last_error = None
        self._connect_event = threading.Event()
        self._subscriptions = set()
        self._subscriptions_lock = threading.Lock()
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
        with self._subscriptions_lock:
            self._subscriptions.clear()
        with self._logs_lock:
            self._logs["sent"].clear()
            self._logs["received"].clear()

        def on_connect(client, userdata, flags, rc):
            self.connected = rc == 0
            self.last_error = None if self.connected else mqtt.connack_string(rc)
            if self.connected:
                try:
                    client.subscribe("device/cpu/temperature")
                    with self._subscriptions_lock:
                        self._subscriptions.add("device/cpu/temperature")
                except Exception as e:
                    self.last_error = f"Auto-subscribe failed: {str(e)}"
            self._connect_event.set()

        def on_message(client, userdata, msg):
            payload = msg.payload.decode(errors="ignore").strip()
            self._append_log("received", topic=msg.topic, payload=payload)

            if msg.topic == "device/cpu/temperature" and payload.lower() == "read":
                temp = self.read_cpu_temperature()
                if temp is not None:
                    result = client.publish(msg.topic, f"{temp:.2f} °C", qos=1)
                    if result.rc == mqtt.MQTT_ERR_SUCCESS:
                        self._append_log("sent", topic=msg.topic, payload=f"{temp:.2f} °C")
                    else:
                        self.last_error = f"Failed to publish temperature: {mqtt.error_string(result.rc)}"
                else:
                    result = client.publish(msg.topic, "Error reading CPU temp", qos=1)
                    if result.rc == mqtt.MQTT_ERR_SUCCESS:
                        self._append_log("sent", topic=msg.topic, payload="Error reading CPU temp")
                    else:
                        self.last_error = f"Failed to publish error: {mqtt.error_string(result.rc)}"

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
        with self._subscriptions_lock:
            self._subscriptions.add(topic)
            return list(self._subscriptions)

    def list_subscriptions(self):
        with self._subscriptions_lock:
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
            "time": datetime.now(datetime.timezone.utc).isoformat() + "Z",
        }
        with self._logs_lock:
            self._logs[direction].appendleft(entry)

    def read_cpu_temperature(self):
        
        try:
            if platform.system() == "Linux":
                with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                    temp_millic = int(f.read().strip())
                return temp_millic / 1000.0  # °C
            else: # Mock for Windows/macOS dev environments
                return 35.0 + (random.random() * 10.0)
        except Exception as e:
            self.last_error = str(e)
            return None
