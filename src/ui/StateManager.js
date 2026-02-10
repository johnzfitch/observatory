/**
 * StateManager - Centralized state management for deepfake detector
 *
 * Handles:
 * - Image state and blob management (with cleanup)
 * - Selected models tracking
 * - Analysis state
 * - Results caching and job cache clearing
 * - Model loading status
 */

export class StateManager {
  constructor() {
    this.reset();
  }

  /**
   * Reset all state to defaults
   */
  reset() {
    this.state = {
      currentImage: null,
      currentImageBlob: null,
      selectedModels: new Set(['ateeqq']), // Single best model - 99.23% accuracy
      isAnalyzing: false,
      analysisResults: null,
      loadedModels: new Set(),
      jobCache: null
    };

    console.log('[StateManager] State reset');
  }

  /**
   * Set image with blob URL
   * Cleans up previous image URL if it was a blob
   */
  setImage(imageUrl, blob = null) {
    // Clean up previous image URL if exists
    if (this.state.currentImage && this.state.currentImage.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.currentImage);
    }

    this.state.currentImage = imageUrl;
    this.state.currentImageBlob = blob;
    this.state.analysisResults = null;
    this.clearJobCache();

    console.log('[StateManager] Image set, previous results cleared');
  }

  /**
   * Clear current image and clean up blob URL
   */
  clearImage() {
    if (this.state.currentImage && this.state.currentImage.startsWith('blob:')) {
      URL.revokeObjectURL(this.state.currentImage);
    }

    this.state.currentImage = null;
    this.state.currentImageBlob = null;
    this.state.analysisResults = null;
    this.clearJobCache();

    console.log('[StateManager] Image cleared');
  }

  /**
   * Set analysis in-progress state
   */
  setAnalyzing(isAnalyzing) {
    this.state.isAnalyzing = isAnalyzing;
    if (!isAnalyzing) {
      this.clearJobCache();
    }
  }

  /**
   * Clear job cache (used between analyses)
   */
  clearJobCache() {
    this.state.jobCache = null;
    console.log('[StateManager] Job cache cleared');
  }

  /**
   * Store analysis results
   */
  setAnalysisResults(results) {
    this.state.analysisResults = results;
    this.clearJobCache();
  }

  /**
   * Toggle model selection
   */
  toggleModel(modelId) {
    if (this.state.selectedModels.has(modelId)) {
      this.state.selectedModels.delete(modelId);
    } else {
      this.state.selectedModels.add(modelId);
    }
  }

  /**
   * Get array of selected model IDs
   */
  getSelectedModels() {
    return Array.from(this.state.selectedModels);
  }

  /**
   * Check if analysis can proceed
   */
  canAnalyze() {
    return this.state.currentImage &&
           this.state.selectedModels.size > 0 &&
           !this.state.isAnalyzing;
  }

  /**
   * Get current state (for debugging)
   */
  getState() {
    return {
      ...this.state,
      selectedModels: Array.from(this.state.selectedModels),
      loadedModels: Array.from(this.state.loadedModels)
    };
  }

  /**
   * Persist image to IndexedDB for crash recovery
   */
  async persistImage() {
    if (!this.state.currentImageBlob) return false;

    try {
      const db = await this._openDB();
      const tx = db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      await store.put({
        id: 'current',
        blob: this.state.currentImageBlob,
        timestamp: Date.now()
      });
      console.log('[StateManager] Image persisted to IndexedDB');
      return true;
    } catch (err) {
      console.warn('[StateManager] Failed to persist image:', err);
      return false;
    }
  }

  /**
   * Restore persisted image from IndexedDB
   * @returns {Promise<{blob: Blob, url: string}|null>}
   */
  async restoreImage() {
    try {
      const db = await this._openDB();
      const tx = db.transaction('images', 'readonly');
      const store = tx.objectStore('images');
      const data = await new Promise((resolve, reject) => {
        const req = store.get('current');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (data && data.blob) {
        // Check if not too old (1 hour max)
        if (Date.now() - data.timestamp < 3600000) {
          const url = URL.createObjectURL(data.blob);
          console.log('[StateManager] Restored image from IndexedDB');
          return { blob: data.blob, url };
        } else {
          // Clean up old image
          await this.clearPersistedImage();
        }
      }
      return null;
    } catch (err) {
      console.warn('[StateManager] Failed to restore image:', err);
      return null;
    }
  }

  /**
   * Clear persisted image from IndexedDB
   */
  async clearPersistedImage() {
    try {
      const db = await this._openDB();
      const tx = db.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      await store.delete('current');
      console.log('[StateManager] Persisted image cleared');
    } catch (err) {
      console.warn('[StateManager] Failed to clear persisted image:', err);
    }
  }

  /**
   * Open/create IndexedDB
   */
  async _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('observatory', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }
      };
    });
  }
}

// Export singleton instance
export const stateManager = new StateManager();
