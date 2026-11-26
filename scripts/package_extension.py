#!/usr/bin/env python3
"""
Package the Video Speed Controller Chrome Extension into an installable ZIP archive.
"""

import os
import zipfile

def package():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    zip_path = os.path.join(base_dir, "video-speed-controller-v1.0.0.zip")

    files_to_include = [
        "manifest.json",
        "utils/constants.js",
        "background/background.js",
        "content/content.js",
        "content/content.css",
        "popup/popup.html",
        "popup/popup.js",
        "popup/popup.css",
        "icons/icon16.png",
        "icons/icon32.png",
        "icons/icon48.png",
        "icons/icon128.png",
    ]

    print(f"Creating extension package: {zip_path}")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for rel_path in files_to_include:
            abs_path = os.path.join(base_dir, rel_path)
            if not os.path.exists(abs_path):
                raise FileNotFoundError(f"Missing required file: {abs_path}")
            zipf.write(abs_path, arcname=rel_path)
            print(f"  + Added {rel_path} ({os.path.getsize(abs_path):,} bytes)")

    size_kb = os.path.getsize(zip_path) / 1024.0
    print(f"\nPackage created successfully! Size: {size_kb:.1f} KB")
    print(f"Location: {zip_path}")

if __name__ == "__main__":
    package()
