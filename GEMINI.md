# WalkTheLine - Firefox Geolocation Debugger Extension

## Project Overview

WalkTheLine is a Firefox browser extension designed to assist developers and testers in debugging geolocation-dependent web applications. It allows users to spoof their browser's reported geographical location, enabling testing of location-aware features without physical movement.

The extension provides the following core functionalities:

*   **Geolocation Spoofing:** Override the `navigator.geolocation` API to report custom latitude, longitude, and accuracy.
*   **Fixed Position Setting:** Manually set a specific location.
*   **Simulated Movement:** Simulate "walking" in a given direction (North, South, East, West) at a specified interval and step size, updating the spoofed location dynamically.
*   **DevTools Integration:** A dedicated "Geo Debugger" panel within Firefox's Developer Tools provides a user interface for controlling the spoofing parameters, including a simple map visualization.
*   **Saved Locations:** Ability to save and load frequently used locations.

**Key Technologies:**

*   **WebExtension APIs:** Utilizes Firefox's WebExtension APIs for background scripts, content scripts, and DevTools integration.
*   **JavaScript:** All logic is implemented in JavaScript.
*   **HTML/CSS:** For the DevTools panel user interface.

**Architecture:**

The extension follows a standard WebExtension architecture:

*   `manifest.json`: Defines the extension's metadata, permissions, and entry points.
*   `background/background.js`: The persistent background script manages the core geolocation spoofing logic, including handling messages from the DevTools panel, maintaining the spoofed position state, and running the movement simulation timers.
*   `content/content-bridge.js`: Injects a page-level script into the inspected tab to override the native `navigator.geolocation` API. It acts as a bridge, forwarding commands from the background script to the page and sending updates back.
*   `devtools/devtools.js`: Creates the "Geo Debugger" panel in the browser's DevTools.
*   `panel/panel.html`: The HTML structure for the DevTools panel's user interface.
*   `panel/panel.js`: The JavaScript for the DevTools panel, handling user interactions, communicating with the background script, and rendering the map.

## Building and Running

This project does not require a separate build step. It can be loaded directly into Firefox as a temporary add-on for development and testing.

**Steps to Load the Extension:**

1.  Open Firefox.
2.  Type `about:debugging#/runtime/this-firefox` in the address bar and press Enter.
3.  Click on "Load Temporary Add-on...".
4.  Navigate to the `/home/jesse/projects/firefox/walktheline/` directory.
5.  Select any file within the directory (e.g., `manifest.json`). Firefox will load the entire extension.

Once loaded, you can open the Developer Tools (F12 or Ctrl+Shift+I) on any tab, and you should see a new "Geo Debugger" panel.

## Development Conventions

*   **Standard WebExtension Practices:** The project adheres to common WebExtension development patterns, including message passing between different parts of the extension (background, content, panel).
*   **Modular Structure:** Code is organized into logical directories (`background`, `content`, `devtools`, `panel`) based on their function within the extension.
*   **No External Dependencies:** The project appears to be self-contained with no external JavaScript libraries or frameworks, relying solely on native browser APIs.
*   **Direct DOM Manipulation:** The `panel/panel.js` uses direct DOM manipulation (`document.getElementById`) for UI updates.
*   **Simple Map Implementation:** The map in the panel is a custom, dependency-free implementation using HTML Canvas and OpenStreetMap tiles for visualization.
