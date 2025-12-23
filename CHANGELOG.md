# Changelog

All notable changes to SetList will be documented in this file.

## [1.0.0-beta] - 2024-12-23

### Added
- **Duplicate Detection Page** - New dedicated page for finding and managing duplicate audio files
  - Audio fingerprint generation using Chromaprint/fpcalc
  - Waveform visualization for comparing duplicates
  - Side-by-side audio playback comparison
  - Safe file deletion with confirmation modal
  
- **Parallel Fingerprint Generation** - Dramatically faster fingerprint processing
  - Configurable worker count (1-16 parallel processes)
  - Default 8 workers, recommended 4-8 for most systems, 12-16 for high-end machines
  - Real-time progress tracking with floating progress bar
  - Stop button to cancel generation at any time
  
- **Fingerprint Status Display**
  - Shows fingerprinted vs unfingerprinted track counts
  - Option to regenerate all fingerprints or only process new tracks
  
- **Git Release Workflow**
  - Main branch for stable releases
  - Develop branch for ongoing development

### Changed
- Moved fingerprint generation UI from Settings to Duplicates page
- Updated AcoustID instructions in Settings page
- Improved polling behavior - only polls during active generation

### Technical
- AsyncIO semaphore-based parallel processing for fpcalc
- Global state management for fingerprint generation progress
- Cancellation mechanism with graceful shutdown
- React Query optimized polling intervals

---

## [0.9.0-beta] - Initial Release

### Features
- Track scanning and metadata extraction
- Series/DJ set organization
- Tracklist matching via 1001tracklists API
- Tag editing and management
- AcoustID integration for track identification
- Dashboard with library statistics
