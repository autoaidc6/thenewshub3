const fs = require('fs');
fs.copyFileSync('/mnt/data/image_1741151061755.png', 'public/android-chrome-512x512.png');
fs.copyFileSync('/mnt/data/image_1741151062060.png', 'public/favicon-32x32.png');
fs.copyFileSync('/mnt/data/image_1741151062369.png', 'public/apple-touch-icon.png');
fs.copyFileSync('/mnt/data/image_1741151062635.png', 'public/android-chrome-192x192.png');
fs.copyFileSync('/mnt/data/image_1741151061755.png', 'public/favicon.ico');
console.log('Images copied');
