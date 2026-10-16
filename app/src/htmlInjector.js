const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const Logger = require('./logs');
const log = new Logger('HtmlInjector');

class HtmlInjector {
    constructor(filesPath, config) {
        this.filesPath = filesPath; // Array of file paths to cache
        this.cache = {}; // Object to store cached files
        this.config = config; // Configuration containing metadata (OG, title, etc.)
        this.injectData = this.getInjectData(); // Initialize dynamic injection data
        this.watcher = null; // File watcher instance

        this.preloadPages(filesPath); // Preload pages at startup
        this.watchFiles(filesPath); // Watch files for changes
        log.info('filesPath cached', this.filesPath);
    }

    // Function to get dynamic data for injection (e.g., OG data, title, etc.)
    getInjectData() {
        return {
            OG_TYPE: this.config?.og?.type || 'app-webrtc',
            OG_SITE_NAME: this.config?.og?.siteName || 'MiroTalk',
            OG_TITLE: this.config?.og?.title || 'MiroTalk P2P - Open Source WebRTC Video Calls & Meetings',
            OG_DESCRIPTION:
                this.config?.og?.description ||
                'MiroTalk P2P is an open-source self-hosted WebRTC video calling and meeting platform. Create fast peer-to-peer video calls with screen sharing, chat, whiteboard and collaboration directly in the browser.',
            OG_IMAGE: this.config?.og?.image || 'https://p2p.mirotalk.com/images/preview.png',
            OG_URL: this.config?.og?.url || 'https://p2p.mirotalk.com',
            // Add more data here as needed with fallbacks
        };
    }

    // Function to load a file into the cache
    loadFileToCache(filePath) {
        try {
            const resolvedPath = path.resolve(filePath);
            const content = fs.readFileSync(resolvedPath, 'utf-8');
            this.cache[filePath] = content; // Store the content in cache
            this.cache[resolvedPath] = content;
        } catch (err) {
            log.error(`Error reading file: ${filePath}`, err);
        }
    }

    // Function to preload pages into the cache
    preloadPages(filePaths) {
        filePaths.forEach((filePath) => this.loadFileToCache(filePath));
    }

    // Function to watch files for changes using chokidar
    watchFiles(filePaths) {
        if (this.watcher) {
            this.watcher.close(); // Close existing watcher if any
        }

        this.watcher = chokidar.watch(filePaths, {
            persistent: true,
            ignoreInitial: true, // Ignore initial 'add' events
        });

        this.watcher
            .on('change', (filePath) => {
                log.debug(`File changed: ${filePath}`);
                this.loadFileToCache(filePath);
                log.debug(`Reloaded file ${filePath} into cache`);
            })
            .on('error', (error) => {
                log.error(`Watcher error: ${error.message}`);
            });
    }

    // Function to inject dynamic data (e.g., OG, TITLE, etc.) into a given file
    injectHtml(filePath, res) {
        const resolvedPath = path.resolve(filePath);
        let cached = this.cache[filePath] || this.cache[resolvedPath];

        if (!cached) {
            this.loadFileToCache(filePath);
            cached = this.cache[filePath] || this.cache[resolvedPath];
        }

        // Check if HTML injection is enabled in the config
        if (!this.config?.htmlInjection) {
            return res.send(cached);
        }

        if (!cached) {
            log.error(`File not cached: ${filePath}`);
            if (!res.headersSent) {
                return res.status(500).send('Server Error');
            }
            return;
        }

        try {
            // Replace placeholders with dynamic data (OG, TITLE, etc.)
            const modifiedHTML = cached.replace(
                /{{(OG_[A-Z_]+)}}/g,
                (_, key) => this.injectData[key] || ''
            );

            if (!res.headersSent) {
                res.send(modifiedHTML);
            }
        } catch (error) {
            log.error('Error injecting HTML data:', error);
            if (!res.headersSent) {
                res.status(500).send('Server Error');
            }
        }
    }

    // Cleanup watcher when the instance is no longer needed
    cleanup() {
        if (this.watcher) {
            this.watcher.close();
        }
    }
}

module.exports = HtmlInjector;
