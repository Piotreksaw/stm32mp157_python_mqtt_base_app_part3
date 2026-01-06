# MQTT Studio

Lightweight web tool for testing MQTT brokers - Flask backend with a single-page UI for publishing, subscribing, and live message monitoring.

## Highlights
- One-click connect to a broker via URL/IP with live online/offline status.
- Single and periodic publish (adjustable interval) to any topic.
- Multiple subscriptions with a live list of active topics.
- Sent/received logs with UTC timestamps and direction tags.
- Static UI served by Flask - runs in any browser, nothing to install on the client.

## Screenshots
<img width="1557" height="787" alt="mainUIpart1" src="https://github.com/user-attachments/assets/58bce311-8426-4540-8ad2-962383b7301f" />
<img width="1523" height="737" alt="mainUIpart2" src="https://github.com/user-attachments/assets/c8432bed-1764-4f89-86ab-3c9d8c41d332" />
<img width="1580" height="624" alt="593435688_1184599920450024_5034510601861845838_n" src="https://github.com/user-attachments/assets/88dfe36f-288f-4c9d-b90a-e24c4d644474" />
<img width="556" height="767" alt="593991935_1269462811875348_983846594040829029_n" src="https://github.com/user-attachments/assets/8af4fbc0-8568-433f-a751-811fe131f82e" />

## Project layout
- `main.py` - entry point starting the Flask app.
- `app/server.py` - API (connect, publish, subscribe, logs) and static file serving.
- `app/mqtt_client.py` - `paho-mqtt` wrapper for connect/publish/subscribe and bounded logs.
- `static/` - frontend assets: `index.html`, `style.css`, `app.js`.

## Using the app (after it is running)
- Open `http://localhost:5000/` in your browser.
- Enter the broker address (e.g., `mqtt://broker.hivemq.com:1883`) and click **Connect**.
- Publish messages (single/periodic) and subscribe to topics; sent/received logs update live.

## Accessing on STM32MP157
- If you use paho higher version over 2.0 uncomment lines in mqtt_client.py.
- Determine the board IP (e.g., `ip addr show` -> look for `inet 192.168.x.y`).
- From a device on the same network, open `http://<board-ip>:5000/` in a browser.
- If using USB RNDIS/ECM, the host typically sees the board at a link-local IP (e.g., `192.168.7.x`); use that address with port 5000.
![linux](https://github.com/user-attachments/assets/e4da167e-cba6-4458-8843-962472999712)


## Requirements
- Python 3.9+.
- An MQTT broker reachable from the device for testing.

## For next users, how to even run this project

1. Connect keyboard, mouse, external screen to Nucleo
2. Connect Power Supply (at least 15W) to USB-C port next to RJ45 port
3. Then you have to connect Nucelo to your Wi-Fi. How to do it:
4. In terminal run `su` command, then run `vi /etc/wpa_supplicant/wpa_supplicant.conf`, where you have to insert you internet name and password
5. Next step is to run `wifi_connect.sh` or `wifi_connect.sh`.
6. You can also just connect ethernet cable xd - it's much easier than Wi-Fi config
7. Use command `ip addr show` to get the board IP
8. Go to folder `cd home/pliki_usb/stm32mp157_python_mqtt_base_app-main/` and run `python3 main.py` -> This action starts up the server
9. On other device open `http://<board-ip>:5000/` in browser, paste `mqtt://broker.hivemq.com:1883`
10. click connect button. You are ready to go :)
