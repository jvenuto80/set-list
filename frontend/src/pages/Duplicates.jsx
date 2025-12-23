import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  Copy, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2,
  Folder,
  HardDrive,
  Music,
  RefreshCw,
  Fingerprint,
  ExternalLink
} from 'lucide-react'
import { getDuplicates, getFingerprintStatus, deleteTrackFile, generateFingerprints } from '../api'
import AudioPlayer from '../components/AudioPlayer'
import ProgressButton from '../components/ProgressButton'

function Duplicates() {
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { trackId, filename }
  const [deleteResult, setDeleteResult] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  const { data: fpStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['fingerprintStatus'],
    queryFn: getFingerprintStatus,
  })

  const { data: duplicates, isLoading: dupsLoading, refetch } = useQuery({
    queryKey: ['duplicates'],
    queryFn: getDuplicates,
    enabled: fpStatus?.fingerprinted_tracks > 0,
  })

  const fingerprintMutation = useMutation({
    mutationFn: () => generateFingerprints(false),
    onSuccess: () => {
      queryClient.invalidateQueries(['fingerprintStatus'])
      queryClient.invalidateQueries(['duplicates'])
    }
  })

  const deleteMutation = useMutation({
    mutationFn: ({ trackId }) => deleteTrackFile(trackId),
    onSuccess: (data, { filename }) => {
      setDeleteResult({ success: true, message: `Deleted: ${filename}` })
      setDeleteConfirm(null)
      queryClient.invalidateQueries(['duplicates'])
      queryClient.invalidateQueries(['tracks'])
      queryClient.invalidateQueries(['fingerprintStatus'])
      // Clear result after 3 seconds
      setTimeout(() => setDeleteResult(null), 3000)
    },
    onError: (error, { filename }) => {
      setDeleteResult({ success: false, message: `Failed to delete ${filename}: ${error.message}` })
      setDeleteConfirm(null)
    }
  })

  const toggleGroup = (hash) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(hash)) {
        next.delete(hash)
      } else {
        next.add(hash)
      }
      return next
    })
  }

  const formatSize = (bytes) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Calculate total wasted space
  const totalWastedSpace = duplicates?.duplicate_groups?.reduce((total, group) => {
    // All but one file in each group is "wasted"
    const sortedTracks = [...group.tracks].sort((a, b) => b.file_size - a.file_size)
    const wastedInGroup = sortedTracks.slice(1).reduce((sum, t) => sum + t.file_size, 0)
    return total + wastedInGroup
  }, 0) || 0

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  // Not enough fingerprints yet
  if (!fpStatus?.fingerprinted_tracks || fpStatus.fingerprinted_tracks === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Copy className="w-7 h-7 text-orange-500" />
            Duplicate Detection
          </h1>
        </div>

        <div className="bg-gray-800 rounded-xl p-8 text-center">
          <Fingerprint className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Fingerprints Generated</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Generate audio fingerprints for your library to detect duplicate files.
            This analyzes the actual audio content, not just filenames.
          </p>
          <ProgressButton
            onClick={() => fingerprintMutation.mutate()}
            isLoading={fingerprintMutation.isPending}
            loadingText="Generating fingerprints..."
            icon={<Fingerprint className="w-4 h-4" />}
            variant="primary"
          >
            Generate Fingerprints
          </ProgressButton>
          <p className="text-gray-500 text-sm mt-4">
            {fpStatus?.total_tracks || 0} tracks in library
          </p>
        </div>
      </div>
    )
  }

  const noDuplicates = !duplicates?.duplicate_groups?.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Copy className="w-7 h-7 text-orange-500" />
          Duplicate Detection
        </h1>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Banner */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-400">
              {fpStatus.fingerprinted_tracks}
            </div>
            <div className="text-sm text-gray-400">Fingerprinted Tracks</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-400">
              {duplicates?.duplicate_groups?.length || 0}
            </div>
            <div className="text-sm text-gray-400">Duplicate Groups</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-400">
              {duplicates?.total_duplicates || 0}
            </div>
            <div className="text-sm text-gray-400">Total Duplicate Files</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-400">
              {formatSize(totalWastedSpace)}
            </div>
            <div className="text-sm text-gray-400">Potential Space Savings</div>
          </div>
        </div>
      </div>

      {/* Delete Result Toast */}
      {deleteResult && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          deleteResult.success 
            ? 'bg-green-900/30 border border-green-700' 
            : 'bg-red-900/30 border border-red-700'
        }`}>
          {deleteResult.success 
            ? <CheckCircle2 className="w-5 h-5 text-green-500" />
            : <AlertTriangle className="w-5 h-5 text-red-500" />
          }
          <span>{deleteResult.message}</span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <h2 className="text-xl font-bold">Delete File Permanently?</h2>
            </div>
            <p className="text-gray-300 mb-2">
              This will permanently delete the file from your disk:
            </p>
            <p className="text-sm bg-gray-900 p-3 rounded-lg font-mono break-all mb-4">
              {deleteConfirm.filepath}
            </p>
            <p className="text-yellow-400 text-sm mb-6">
              ⚠️ This action cannot be undone!
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate({ 
                  trackId: deleteConfirm.trackId, 
                  filename: deleteConfirm.filename 
                })}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center gap-2"
              >
                {deleteMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Duplicates State */}
      {noDuplicates && (
        <div className="bg-gray-800 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Duplicates Found!</h2>
          <p className="text-gray-400">
            Your library is clean. All {fpStatus.fingerprinted_tracks} fingerprinted tracks are unique.
          </p>
        </div>
      )}

      {/* Duplicate Groups */}
      {!noDuplicates && (
        <div className="space-y-4">
          {duplicates.duplicate_groups.map((group, groupIdx) => {
            const isExpanded = expandedGroups.has(group.fingerprint_hash)
            const trackCount = group.tracks.length
            // Sort by size descending - largest first (keep this one)
            const sortedTracks = [...group.tracks].sort((a, b) => b.file_size - a.file_size)
            
            return (
              <div 
                key={group.fingerprint_hash} 
                className="bg-gray-800 rounded-xl overflow-hidden"
              >
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.fingerprint_hash)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center">
                      <Copy className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">
                        Duplicate Group #{groupIdx + 1}
                      </div>
                      <div className="text-sm text-gray-400">
                        {trackCount} identical audio files
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">
                      {formatSize(sortedTracks.slice(1).reduce((s, t) => s + t.file_size, 0))} recoverable
                    </span>
                    <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-700">
                    {sortedTracks.map((track, trackIdx) => (
                      <div 
                        key={track.id}
                        className={`p-4 ${trackIdx > 0 ? 'border-t border-gray-700/50' : ''} ${
                          trackIdx === 0 ? 'bg-green-900/10' : 'bg-gray-800'
                        }`}
                      >
                        {/* Track Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {trackIdx === 0 && (
                                <span className="px-2 py-0.5 text-xs bg-green-600 rounded-full">
                                  KEEP (largest)
                                </span>
                              )}
                              {trackIdx > 0 && (
                                <span className="px-2 py-0.5 text-xs bg-red-600/50 rounded-full">
                                  DUPLICATE
                                </span>
                              )}
                            </div>
                            <Link 
                              to={`/tracks/${track.id}`}
                              className="font-medium text-primary-400 hover:text-primary-300 flex items-center gap-2"
                            >
                              <Music className="w-4 h-4" />
                              {track.filename}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                            <div className="text-sm text-gray-400 flex items-center gap-4 mt-1">
                              <span className="flex items-center gap-1">
                                <Folder className="w-3 h-3" />
                                {track.filepath?.split('/').slice(-2, -1)[0] || 'Unknown folder'}
                              </span>
                              <span className="flex items-center gap-1">
                                <HardDrive className="w-3 h-3" />
                                {formatSize(track.file_size)}
                              </span>
                              <span>
                                {formatDuration(track.duration)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Delete Button - only for duplicates (not the first/largest) */}
                          {trackIdx > 0 && (
                            <button
                              onClick={() => setDeleteConfirm({
                                trackId: track.id,
                                filename: track.filename,
                                filepath: track.filepath
                              })}
                              className="px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )}
                        </div>

                        {/* Audio Player with Waveform */}
                        <div className="bg-gray-900/50 rounded-lg p-3">
                          <AudioPlayer trackId={track.id} compact className="w-full" />
                        </div>

                        {/* Full Path (collapsible) */}
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                            Show full path
                          </summary>
                          <code className="text-xs text-gray-500 break-all block mt-1 pl-4">
                            {track.filepath}
                          </code>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Duplicates
