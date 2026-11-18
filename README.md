# Wi-Fi CSI Monitor

A static dashboard for inspecting radio-link motion activity and changes in Wi-Fi CSI amplitude. It starts in a labeled simulation. Live CSI stays in the browser and is discarded on reload.

## Run the dashboard

From the project directory, run `python -m http.server 8000 --bind 127.0.0.1 --directory docs`, then open <http://localhost:8000> in desktop Chrome or Edge. Demo mode runs without hardware. Use HTTPS for hosted Web Serial.

## Connect live hardware

1. Use an ESP32 DevKit and your own 2.4 GHz Wi-Fi router. The router supplies packets as an ordinary access point.
2. Install ESP-IDF using Espressif's instructions. Open [csi_recv_router](https://github.com/espressif/esp-csi/tree/master/examples/get-started/csi_recv_router) in the upstream ESP-CSI repository. Run `idf.py set-target esp32` for a classic ESP32. For a different supported chip choose its target.
3. Run `idf.py menuconfig` and set your network credentials in the example connection settings. Run `idf.py -p PORT flash monitor`. Confirm that the monitor prints `CSI_DATA` rows. Close the monitor before connecting from the browser.
4. Click **Connect ESP32**, select the board's USB serial port and keep the area still until calibration completes. Walk through the link and observe the timeline. Keep board and router placement fixed. Click **Calibrate baseline** if the configuration or room changes.

The USB ESP8266EX previously detected on COM10 has an erased flash. Espressif's receiver example targets ESP32-family chips. The ESP8266 is outside this implementation's live capture path.

## Data and calibration

The parser accepts the Espressif receiver's legacy CSI_DATA CSV format with a signed I/Q array after the length and first-word flag. It drops the first four bytes when flagged, computes magnitudes, and only compares packets matching the initial sender and packet layout. Recalibrate to select a new stream. Other CSI tools need format adapters.

Each 250 ms interval aggregates consecutive-packet normalized amplitude changes. The first 32 intervals with data establish a baseline. Motion requires two of the latest three intervals to exceed baseline mean plus the greater of four standard deviations or 0.015. A missing interval clears the motion confirmation window. The repeated threshold crossings follow the general approach documented in the [Espressif radar example](https://github.com/espressif/esp-csi/tree/master/examples/esp-radar/connect_rainmaker). This is a heuristic activity score. Interference and changes in channel conditions can trigger it. The timeline keeps 30 seconds. The heatmap rows are I/Q bin positions in the receiver's CSI buffer, which may contain multiple training fields or null bins. No packet gap gets a heatmap sample.

A single link reports when signal variation rises. Spatial localization requires additional link geometry or a separately validated model. Standard CSI captures channel response. This project has no calibrated method for estimating an absolute temperature or a temperature gradient from that response. Heatmap colors encode normalized CSI amplitude changes.

## Publish on GitHub Pages

Push this directory as its own GitHub repository. Under **Settings → Pages**, select **Deploy from a branch**, choose the default branch and **/docs**, then save. The repository README contains the setup and sources. The page runs fully on GitHub Pages and connects directly to USB from the viewer's browser.

## Sources and platform review

- [Bilawal Sidhu's overview](https://www.spatialintelligence.ai/p/your-wifi-can-see-you-heres-how) gives examples of motion sensing, trained pose estimation, and RF localization. Those are distinct capabilities with different hardware and validation needs.
- [NTUMARS CSI Tool index](https://github.com/NTUMARS/Awesome-WiFi-CSI-Sensing#csi-tool) points to capture platforms. [Intel 5300](https://dhalperi.github.io/linux-80211n-csitool/) uses dedicated hardware and modified Linux drivers and reports 30 subcarrier groups. [Atheros CSI Tool](https://wands.sg/research/wifi/AtherosCSI/) targets supported Qualcomm Atheros NICs. [Nexmon CSI](https://github.com/seemoo-lab/nexmon_csi) targets documented Broadcom chip and firmware combinations. [ESP32 CSI Toolkit](https://stevenmhernandez.github.io/ESP32-CSI-Tool/) is an ESP32 capture toolkit with its own output format. [USRP](https://www.ettus.com/) and [WARP](https://warpproject.org/) are programmable radio platforms.
- The list also catalogs activity recognition, occupancy, pose, localization, robustness, and datasets. [SenseFi](https://github.com/xyanchen/WiFi-CSI-Sensing-Benchmark) provides model and dataset benchmarks. The dashboard does not ship a trained model or claim benchmark accuracy.
- [Espressif CSI API](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/wifi-driver/wifi-vendor-features.html) documents I/Q layout and the invalid-first-word flag.
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) documents branch and folder configuration.
