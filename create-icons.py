#!/usr/bin/env python3
"""Generate crisp SmartPaste Pro PNG icons with rounded aesthetic."""
import struct
import zlib
import os
import math

def generate_icon(size):
    # RGBA image buffer
    pixels = bytearray(size * size * 4)

    # Theme colors: Background #6C63FF (108, 99, 255), Accent #A6E3A1, White #FFFFFF
    bg_r, bg_g, bg_b = 108, 99, 255
    clip_r, clip_g, clip_b = 255, 255, 255

    center = size / 2.0
    corner_radius = size * 0.22

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4

            # Rounded square distance for background icon
            dx = max(0, abs(x + 0.5 - center) - (center - corner_radius))
            dy = max(0, abs(y + 0.5 - center) - (center - corner_radius))
            dist = math.sqrt(dx * dx + dy * dy)

            if dist > corner_radius:
                # Outside icon rounded squircle
                pixels[idx:idx+4] = b'\x00\x00\x00\x00'
                continue

            # Base background color
            r, g, b, a = bg_r, bg_g, bg_b, 255

            # Anti-aliasing edge
            if dist > corner_radius - 1.0:
                edge_factor = max(0.0, min(1.0, corner_radius - dist))
                a = int(255 * edge_factor)

            # Draw clipboard glyph inside icon
            # Normalized coordinates (0 to 1)
            nx = x / float(size)
            ny = y / float(size)

            # Clipboard board: center x from 0.28 to 0.72, y from 0.28 to 0.78
            in_board = (0.28 <= nx <= 0.72) and (0.28 <= ny <= 0.78)
            # Clip tab on top: center x from 0.40 to 0.60, y from 0.20 to 0.32
            in_tab = (0.40 <= nx <= 0.60) and (0.20 <= ny <= 0.32)

            if in_board or in_tab:
                # White clipboard silhouette
                r, g, b = clip_r, clip_g, clip_b

                # Draw blue lines on clipboard paper
                # Line 1: y from 0.42 to 0.46, x from 0.36 to 0.64
                # Line 2: y from 0.52 to 0.56, x from 0.36 to 0.64
                # Line 3: y from 0.62 to 0.66, x from 0.36 to 0.56
                if (0.42 <= ny <= 0.46 and 0.36 <= nx <= 0.64) or \
                   (0.52 <= ny <= 0.56 and 0.36 <= nx <= 0.64) or \
                   (0.62 <= ny <= 0.66 and 0.36 <= nx <= 0.54):
                    r, g, b = 108, 99, 255

            pixels[idx] = r
            pixels[idx+1] = g
            pixels[idx+2] = b
            pixels[idx+3] = a

    # PNG generation
    def png_chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0) # 8-bit RGBA
    raw = bytearray()
    for row in range(size):
        raw.append(0) # filter byte 0 (None)
        start = row * size * 4
        raw.extend(pixels[start:start + size * 4])

    compressed = zlib.compress(bytes(raw), 9)
    return (
        b'\x89PNG\r\n\x1a\n' +
        png_chunk(b'IHDR', ihdr_data) +
        png_chunk(b'IDAT', compressed) +
        png_chunk(b'IEND', b'')
    )

os.makedirs('e:/Copy & Paste/icons', exist_ok=True)
for s in [16, 32, 48, 128]:
    data = generate_icon(s)
    path = f'e:/Copy & Paste/icons/icon{s}.png'
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Generated {path} ({s}x{s})')

