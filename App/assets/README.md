# CLAUDE PUNK Assets

## Required Assets for Building

### icon.icns
macOS application icon. Should be a 1024x1024 PNG converted to .icns format.

**Design Guidelines:**
- Cyberpunk/neon aesthetic
- Based on the bar's neon sign from the game
- Clearly visible when scaled down to 16x16

**How to create:**
1. Design a 1024x1024 PNG in assets/icon.png
2. Use online tool or iconutil to convert to .icns:
   ```bash
   mkdir icon.iconset
   sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
   sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
   sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
   sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
   sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
   sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
   sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
   sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
   sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
   sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
   iconutil -c icns icon.iconset
   mv icon.icns assets/
   ```

### dmg-background.png
DMG installer background image (540x380).

**Design Guidelines:**
- Cyberpunk aesthetic matching the game
- Clear "Drag to Applications" visual cue
- Should not obscure the app icon or Applications folder link

**Placeholder:**
For testing, you can use a solid color PNG or skip the background (electron-builder will use a default).

## Current Status

- [ ] icon.icns - TODO: Create cyberpunk neon bar icon
- [ ] dmg-background.png - TODO: Create installer background

For MVP testing, electron-builder will use default icons.
