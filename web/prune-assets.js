const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'dist');
const VITE_ASSETS_BASE = path.join(DIST_DIR, 'assets');
const PORTAL_ROOT = path.join(DIST_DIR, 'data', 'portal-master');
const ASSETS_BASE = path.join(PORTAL_ROOT, 'images');

const UNUSED_VITE_ASSETS = [
    'backgrounds',
    'skills'
];

const UNUSED_IMAGES_FOLDERS = [
    'skills',
    'skill_trees',
    'quests',
    'effects'
];

const ITEM_ASSETS_BASE = path.join(ASSETS_BASE, 'items');
const UNUSED_ITEM_FOLDERS = [
    'armor',
    'belt',
    'boots',
    'gloves',
    'helm',
    'offhand',
    'weapon'
];

const UNUSED_ROOT_FOLDERS = [
    'saves',
    'data'
];

const UNUSED_FILES = [
    'LICENSE.txt',
    'README.md'
];

function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
        console.log(`Deleted: ${directoryPath}`);
    }
}

console.log('Starting asset pruning...');

if (!fs.existsSync(ASSETS_BASE)) {
    console.error(`Directory not found: ${ASSETS_BASE}`);
    process.exit(0);
}

let totalDeleted = 0;

UNUSED_VITE_ASSETS.forEach(folder => {
    const folderPath = path.join(VITE_ASSETS_BASE, folder);
    if (fs.existsSync(folderPath)) {
        deleteFolderRecursive(folderPath);
        totalDeleted++;
    }
});

UNUSED_IMAGES_FOLDERS.forEach(folder => {
    const folderPath = path.join(ASSETS_BASE, folder);
    if (fs.existsSync(folderPath)) {
        deleteFolderRecursive(folderPath);
        totalDeleted++;
    }
});

UNUSED_ITEM_FOLDERS.forEach(folder => {
    const folderPath = path.join(ITEM_ASSETS_BASE, folder);
    if (fs.existsSync(folderPath)) {
        deleteFolderRecursive(folderPath);
        totalDeleted++;
    }
});

UNUSED_ROOT_FOLDERS.forEach(folder => {
    const folderPath = path.join(PORTAL_ROOT, folder);
    if (fs.existsSync(folderPath)) {
        deleteFolderRecursive(folderPath);
        totalDeleted++;
    }
});

UNUSED_FILES.forEach(file => {
    const filePath = path.join(PORTAL_ROOT, file);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted file: ${filePath}`);
        totalDeleted++;
    }
});

console.log(`Pruning complete. ${totalDeleted} items removed.`);
