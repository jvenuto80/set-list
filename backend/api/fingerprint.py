"""
API endpoints for audio fingerprinting and track identification.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy import select
from loguru import logger

from backend.services.database import get_db
from backend.models.track import Track
from backend.services.fingerprint import (
    generate_fingerprint,
    fingerprint_to_hash,
    identify_with_acoustid_extended,
    find_duplicates_by_fingerprint,
    check_fpcalc_available
)
from backend.config import settings
from backend.api.settings import load_saved_settings

router = APIRouter(prefix="/fingerprint", tags=["fingerprint"])


class IdentifyRequest(BaseModel):
    track_id: int


class IdentifyResponse(BaseModel):
    success: bool
    track_id: int
    result: Optional[dict] = None
    message: str


class FingerprintStatusResponse(BaseModel):
    fpcalc_available: bool
    acoustid_configured: bool
    total_tracks: int
    fingerprinted_tracks: int


class DuplicateGroup(BaseModel):
    fingerprint_hash: str
    tracks: List[dict]


class DuplicatesResponse(BaseModel):
    duplicate_groups: List[DuplicateGroup]
    total_duplicates: int


class GenerateFingerprintsResponse(BaseModel):
    success: bool
    processed: int
    failed: int
    message: str


@router.get("/status", response_model=FingerprintStatusResponse)
async def get_fingerprint_status():
    """Get fingerprinting system status."""
    fpcalc_ok = await check_fpcalc_available()
    saved = load_saved_settings()
    acoustid_key = saved.get('acoustid_api_key', '')
    
    async with get_db() as db:
        total_result = await db.execute(select(Track))
        total = len(total_result.scalars().all())
        
        fp_result = await db.execute(
            select(Track).where(Track.fingerprint_hash.isnot(None))
        )
        fingerprinted = len(fp_result.scalars().all())
    
    return FingerprintStatusResponse(
        fpcalc_available=fpcalc_ok,
        acoustid_configured=bool(acoustid_key),
        total_tracks=total,
        fingerprinted_tracks=fingerprinted
    )


@router.post("/identify", response_model=IdentifyResponse)
async def identify_track(request: IdentifyRequest):
    """
    Identify a track using AcoustID audio fingerprinting.
    Returns metadata from MusicBrainz if a match is found.
    """
    saved = load_saved_settings()
    acoustid_key = saved.get('acoustid_api_key', '')
    if not acoustid_key:
        raise HTTPException(
            status_code=400,
            detail="AcoustID API key not configured. Add it in Settings."
        )
    
    async with get_db() as db:
        result = await db.execute(
            select(Track).where(Track.id == request.track_id)
        )
        track = result.scalar_one_or_none()
        
        if not track:
            raise HTTPException(status_code=404, detail="Track not found")
        
        # Identify using AcoustID
        match_result = await identify_with_acoustid_extended(
            track.filepath,
            acoustid_key
        )
        
        if match_result:
            return IdentifyResponse(
                success=True,
                track_id=track.id,
                result=match_result,
                message=f"Match found: {match_result.get('artist')} - {match_result.get('title')} (confidence: {match_result.get('score', 0):.0%})"
            )
        else:
            return IdentifyResponse(
                success=False,
                track_id=track.id,
                result=None,
                message="No match found in AcoustID database"
            )


@router.post("/identify/{track_id}/apply")
async def apply_identification(track_id: int, metadata: dict):
    """Apply identified metadata to a track."""
    async with get_db() as db:
        result = await db.execute(
            select(Track).where(Track.id == track_id)
        )
        track = result.scalar_one_or_none()
        
        if not track:
            raise HTTPException(status_code=404, detail="Track not found")
        
        # Update matched metadata
        if metadata.get('title'):
            track.matched_title = metadata['title']
        if metadata.get('artist'):
            track.matched_artist = metadata['artist']
        if metadata.get('album'):
            track.matched_album = metadata['album']
        if metadata.get('year'):
            track.matched_year = metadata['year']
        
        track.match_source = 'acoustid'
        track.match_confidence = metadata.get('score', 0) * 100
        track.status = 'matched'
        
        await db.commit()
        
        return {"success": True, "message": "Metadata applied"}


@router.post("/generate", response_model=GenerateFingerprintsResponse)
async def generate_fingerprints(
    background_tasks: BackgroundTasks,
    overwrite: bool = False
):
    """
    Generate fingerprints for all tracks in the library.
    Runs in background for large libraries.
    """
    fpcalc_ok = await check_fpcalc_available()
    if not fpcalc_ok:
        raise HTTPException(
            status_code=500,
            detail="fpcalc (Chromaprint) not available. Install libchromaprint-tools."
        )
    
    async with get_db() as db:
        if overwrite:
            result = await db.execute(select(Track))
        else:
            result = await db.execute(
                select(Track).where(Track.fingerprint_hash.is_(None))
            )
        tracks = result.scalars().all()
        
        if not tracks:
            return GenerateFingerprintsResponse(
                success=True,
                processed=0,
                failed=0,
                message="All tracks already have fingerprints"
            )
        
        processed = 0
        failed = 0
        
        for track in tracks:
            try:
                fp_result = await generate_fingerprint(track.filepath)
                if fp_result:
                    duration, fingerprint = fp_result
                    track.fingerprint_hash = fingerprint_to_hash(fingerprint)
                    processed += 1
                else:
                    failed += 1
            except Exception as e:
                logger.error(f"Error fingerprinting {track.filepath}: {e}")
                failed += 1
        
        await db.commit()
        
        return GenerateFingerprintsResponse(
            success=True,
            processed=processed,
            failed=failed,
            message=f"Generated fingerprints for {processed} tracks ({failed} failed)"
        )


@router.get("/duplicates", response_model=DuplicatesResponse)
async def find_duplicates():
    """Find duplicate tracks based on audio fingerprint."""
    async with get_db() as db:
        result = await db.execute(
            select(Track).where(Track.fingerprint_hash.isnot(None))
        )
        tracks = result.scalars().all()
        
        # Convert to dicts for the duplicate finder
        track_dicts = [
            {
                'id': t.id,
                'filename': t.filename,
                'filepath': t.filepath,
                'title': t.title,
                'artist': t.artist,
                'album': t.album,
                'duration': t.duration,
                'file_size': t.file_size,
                'fingerprint_hash': t.fingerprint_hash
            }
            for t in tracks
        ]
        
        duplicates = await find_duplicates_by_fingerprint(track_dicts)
        
        duplicate_groups = [
            DuplicateGroup(
                fingerprint_hash=group[0]['fingerprint_hash'],
                tracks=group
            )
            for group in duplicates
        ]
        
        total = sum(len(g.tracks) for g in duplicate_groups)
        
        return DuplicatesResponse(
            duplicate_groups=duplicate_groups,
            total_duplicates=total
        )


@router.post("/generate/{track_id}")
async def generate_single_fingerprint(track_id: int):
    """Generate fingerprint for a single track."""
    fpcalc_ok = await check_fpcalc_available()
    if not fpcalc_ok:
        raise HTTPException(
            status_code=500,
            detail="fpcalc (Chromaprint) not available"
        )
    
    async with get_db() as db:
        result = await db.execute(
            select(Track).where(Track.id == track_id)
        )
        track = result.scalar_one_or_none()
        
        if not track:
            raise HTTPException(status_code=404, detail="Track not found")
        
        fp_result = await generate_fingerprint(track.filepath)
        if fp_result:
            duration, fingerprint = fp_result
            track.fingerprint_hash = fingerprint_to_hash(fingerprint)
            await db.commit()
            
            return {
                "success": True,
                "fingerprint_hash": track.fingerprint_hash,
                "message": "Fingerprint generated"
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate fingerprint"
            )
