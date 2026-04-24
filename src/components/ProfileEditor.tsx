import { useState, useRef } from 'react';
import { Upload, X, GripVertical, ChevronLeft, User, Briefcase, GraduationCap, Instagram, MapPin, Plus } from 'lucide-react';
import { EDGE_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { LocationPicker } from './LocationPicker';

// ─────────────────────────────────────────────────────────────
// SECURITY: Strip EXIF metadata from images before upload.
// Redraws the image to a canvas and exports as JPEG/PNG blob.
// This removes GPS coordinates, device info, and all other
// EXIF data that could expose the user's location or identity.
// ─────────────────────────────────────────────────────────────
async function stripExifMetadata(file: File): Promise<File> {
  return new Promise((resolve) => {
    // Only strip from JPEG/PNG — pass through other types unchanged
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      resolve(file);
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      // Cap at 1200px max dimension — reduces upload time ~70% for large photos
      // while keeping more than enough resolution for a dating app profile
      const MAX_DIM = 1200;
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const strippedFile = new File([blob], file.name, { type: outputType, lastModified: Date.now() });
          resolve(strippedFile);
        },
        outputType,
        0.92 // quality — 0.92 preserves visual quality while reducing size
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}


interface ProfileEditorProps {
  isOnboarding: boolean;
  onComplete: (data: {
    photos: string[];
    bio: string;
    career: string;
    education: string;
    instagram: string;
    pronouns: string;
    location?: {
      latitude: number;
      longitude: number;
      city: string;
      country: string;
      locationDisplay: string;
    };
  }) => void | Promise<void>;
  onBack?: () => void;
  initialName?: string;
  initialPhotos?: string[];
  initialBio?: string;
  initialCareer?: string;
  initialEducation?: string;
  initialInstagram?: string;
  initialPronouns?: string;
  initialLocation?: {
    latitude: number;
    longitude: number;
    city: string;
    country: string;
    locationDisplay: string;
  };
}

export function ProfileEditor({
  isOnboarding,
  onComplete,
  onBack,
  initialName = '',
  initialPhotos = [],
  initialBio = '',
  initialCareer = '',
  initialEducation = '',
  initialInstagram = '',
  initialPronouns = '',
  initialLocation,
}: ProfileEditorProps) {
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>(initialPhotos);
  const [bio, setBio] = useState(initialBio);
  const [career, setCareer] = useState(initialCareer);
  const [education, setEducation] = useState(initialEducation);
  const [instagram, setInstagram] = useState(initialInstagram);
  const [pronouns, setPronouns] = useState(initialPronouns);
  const [location, setLocation] = useState(initialLocation);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = initialName.trim() || 'Your Name';
  const firstName = displayName.split(' ')[0];

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (uploadedPhotos.length >= 6) { setUploadError('Maximum 6 photos allowed'); return; }
    setIsUploading(true);
    setUploadError('');
    const token = localStorage.getItem('parallel_access_token');
    if (!token) { setIsUploading(false); return; }

    const newPhotos: string[] = [];
    for (let i = 0; i < Math.min(files.length, 6 - uploadedPhotos.length); i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) { setUploadError('Each photo must be under 10MB'); continue; }
      try {
        const strippedFile = await stripExifMetadata(file);
        const formData = new FormData();
        formData.append('photo', strippedFile);
        formData.append('position', String(uploadedPhotos.length + newPhotos.length));
        const res = await fetch(`${EDGE_FUNCTION_URL}/photos/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) newPhotos.push(data.url);
        } else { setUploadError('Failed to upload photo. Please try again.'); }
      } catch { setUploadError('Upload failed. Please check your connection.'); }
    }
    if (newPhotos.length > 0) {
      const updatedPhotos = [...uploadedPhotos, ...newPhotos];
      setUploadedPhotos(updatedPhotos);
      setHasSaved(false);
      // Save photo URLs immediately so a refresh doesn't lose them
      const savedToken = localStorage.getItem('parallel_access_token');
      if (savedToken) {
        fetch(`${EDGE_FUNCTION_URL}/onboarding/progress`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${savedToken}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({
            current_step: 'photo_upload',
            completed_steps: [],
            partial_answers: {},
            partial_photos: updatedPhotos,
          }),
        }).catch(() => {});
      }
    }
    setIsUploading(false);
  };

  const handleRemovePhoto = (index: number) => { setUploadedPhotos(prev => prev.filter((_, i) => i !== index)); setHasSaved(false); };
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragEnd = () => {
    setDragIndex(null);
    // Persist reordered photos immediately so a refresh doesn't lose the new order
    const token = localStorage.getItem('parallel_access_token');
    if (token && uploadedPhotos.length > 0) {
      fetch(`${EDGE_FUNCTION_URL}/onboarding/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
        body: JSON.stringify({ current_step: 'photo_upload', completed_steps: [], partial_answers: {}, partial_photos: uploadedPhotos }),
      }).catch(() => {});
    }
  };
  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex) return;
    const newPhotos = [...uploadedPhotos];
    const [dragged] = newPhotos.splice(dragIndex, 1);
    newPhotos.splice(targetIndex, 0, dragged);
    setUploadedPhotos(newPhotos);
    setDragIndex(targetIndex);
  };

  const handleComplete = async () => {
    setIsSaving(true);
    setHasSaved(true);
    await onComplete({ photos: uploadedPhotos, bio, career, education, instagram, pronouns, location });
    setIsSaving(false);
  };

  const canSave = uploadedPhotos.length > 0;

  // ── Preview overlay ──────────────────────────────────────────
  if (showPreview) {
    return (
      <div className="min-h-screen bg-white overflow-y-auto">
        <div className="max-w-[390px] mx-auto bg-white">
          <div className="sticky top-0 bg-white z-10 border-b border-gray-100 flex items-center justify-between px-4 py-3">
            <button onClick={() => setShowPreview(false)} className="flex items-center gap-1 text-sm font-medium hover:text-gray-600">
              <ChevronLeft size={18} /> Back to editing
            </button>
            <span className="text-sm font-medium text-gray-500">Preview</span>
            <div className="w-28" />
          </div>
          {uploadedPhotos[0] ? (
            <div className="relative aspect-[3/4] bg-gray-100">
              <img src={uploadedPhotos[0]} alt="Main" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
                <h2 className="text-white text-2xl font-semibold">{displayName}</h2>
                {career && <p className="text-white/80 text-sm mt-1">{career}</p>}
              </div>
            </div>
          ) : (
            <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center">
              <div className="text-center text-gray-400"><User size={48} className="mx-auto mb-2" /><p className="text-sm">No photos yet</p></div>
            </div>
          )}
          <div className="px-6 py-6 space-y-4">
            <div className="space-y-3">
              {career && <div className="flex items-center gap-3 text-gray-700"><Briefcase size={18} className="text-gray-400 shrink-0" /><span>{career}</span></div>}
              {education && <div className="flex items-center gap-3 text-gray-700"><GraduationCap size={18} className="text-gray-400 shrink-0" /><span>{education}</span></div>}
              {instagram && <div className="flex items-center gap-3 text-gray-700"><Instagram size={18} className="text-gray-400 shrink-0" /><span>@{instagram}</span></div>}
              {location?.locationDisplay && <div className="flex items-center gap-3 text-gray-700"><MapPin size={18} className="text-gray-400 shrink-0" /><span>{location.locationDisplay}</span></div>}
            </div>
            {bio && <div className="pt-2"><h3 className="text-sm font-medium text-gray-500 mb-2">About Me</h3><p className="text-gray-800 leading-relaxed">{bio}</p></div>}
            {uploadedPhotos.length > 1 && (
              <div className="pt-2">
                <h3 className="text-sm font-medium text-gray-500 mb-3">More Photos</h3>
                <div className="grid grid-cols-2 gap-3">
                  {uploadedPhotos.slice(1).map((photo, i) => (
                    <div key={i} className="aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">
                      <img src={photo} alt={`Photo ${i + 2}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Editor view ──────────────────────────────────────────────
  // KEY FIX: Use a single scrollable page with no nested scroll containers.
  // Bottom padding ensures content is never hidden under the fixed save button.
  // No overflow-hidden on any parent div — keyboard pushes layout naturally.
  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-[390px] mx-auto bg-white">

        {/* Sticky header */}
        <div className="sticky top-0 bg-white z-10 border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-3">
            {onBack ? (
              <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-all">
                <ChevronLeft size={22} />
              </button>
            ) : <div className="w-10" />}
            <h1 className="text-base font-semibold flex-1 text-center">
              {isOnboarding ? `Create your profile, ${firstName}` : 'Edit Profile'}
            </h1>
            <button onClick={() => setShowPreview(true)} className="text-sm text-gray-500 hover:text-black transition-colors">
              Preview
            </button>
          </div>
        </div>

        {/* All content in a single, naturally scrolling div */}
        {/* pb-32 ensures the save button never covers the bottom content */}
        <div className="px-6 pt-4 pb-36 space-y-6">

          {/* Photos */}
          <div>
            <h2 className="text-base font-semibold mb-1">Photos</h2>
            <p className="text-sm text-gray-500 mb-4">Add up to 6 photos. Drag to reorder. First photo is your main photo.</p>
            {uploadError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600">{uploadError}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {uploadedPhotos.map((photo, index) => (
                <div
                  key={index}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={e => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100 cursor-move border-2 transition-all ${dragIndex === index ? 'border-black opacity-70 scale-95' : 'border-transparent'} ${index === 0 ? 'ring-2 ring-black ring-offset-1' : ''}`}
                >
                  <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  {index === 0 && (
                    <div className="absolute top-1.5 left-1.5 bg-black text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">Main</div>
                  )}
                  <button onClick={() => handleRemovePhoto(index)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-black transition-colors"
                  >
                    <X size={12} className="text-white" />
                  </button>
                  <div className="absolute bottom-1.5 left-1.5 w-5 h-5 bg-black/40 rounded-full flex items-center justify-center">
                    <GripVertical size={10} className="text-white" />
                  </div>
                </div>
              ))}
              {Array.from({ length: 6 - uploadedPhotos.length }).map((_, index) => {
                const slotIndex = uploadedPhotos.length + index;
                const isFirstEmpty = index === 0;
                return (
                  <div
                    key={`empty-${slotIndex}`}
                    onClick={isFirstEmpty && !isUploading ? () => fileInputRef.current?.click() : undefined}
                    className={`aspect-[3/4] rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-300 ${
                      isFirstEmpty && !isUploading ? 'cursor-pointer hover:border-gray-300 hover:text-gray-400 transition-colors' : ''
                    }`}
                  >
                    {isFirstEmpty && isUploading ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus size={16} />
                        <span className="text-xs">Add</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic" multiple className="hidden"
              onChange={e => handlePhotoUpload(e.target.files)}
            />
          </div>

          {/* Career */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Career <span className="text-gray-400 font-normal">— shown on your profile</span>
            </label>
            <div className="relative">
              <Briefcase size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={career}
                onChange={e => { setCareer(e.target.value); setHasSaved(false); }}
                placeholder="e.g. Product Manager, Teacher, Nurse..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-black focus:outline-none transition-colors"
                style={{ fontSize: '16px' }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-1">This appears exactly as you type it on your profile.</p>
          </div>

          {/* Education */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Education <span className="text-gray-400 font-normal">— shown on your profile</span>
            </label>
            <div className="relative">
              <GraduationCap size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={education}
                onChange={e => { setEducation(e.target.value); setHasSaved(false); }}
                placeholder="e.g. University of Washington, Trade School..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-black focus:outline-none transition-colors"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              About Me <span className="text-gray-400 font-normal">— shown on your profile</span>
            </label>
            <textarea
              value={bio}
              onChange={e => { setBio(e.target.value.slice(0, 300)); setHasSaved(false); }}
              placeholder="Write a short bio — who you are, what you care about, what you're looking for..."
              rows={4}
              className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-black focus:outline-none transition-colors resize-none"
              style={{ fontSize: '16px' }}
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-400 ml-1">Specific details make it easier to start a conversation.</p>
              <p className="text-xs text-gray-400">{bio.length}/300</p>
            </div>
          </div>

          {/* Pronouns */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pronouns <span className="text-gray-400 font-normal">— optional</span>
            </label>
            <input type="text" value={pronouns}
              onChange={e => { setPronouns(e.target.value); setHasSaved(false); }}
              placeholder="e.g. she/her, he/him, they/them..."
              className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-black focus:outline-none transition-colors"
              style={{ fontSize: '16px' }}
            />
            {pronouns && <p className="text-xs text-amber-600 mt-1 ml-1">⚠ This will be shown on your public profile</p>}
          </div>

          {/* Instagram */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instagram <span className="text-gray-400 font-normal">— optional, shown after mutual match</span>
            </label>
            <div className="flex items-center rounded-2xl border-2 border-gray-200 focus-within:border-black transition-colors overflow-hidden">
              <span className="pl-4 pr-1 text-gray-500 font-medium select-none" style={{fontSize:'16px'}}>@</span>
              <input 
                type="text" 
                value={instagram}
                onChange={e => { setInstagram(e.target.value.replace('@','')); setHasSaved(false); }} 
                placeholder="yourhandle" 
                className="flex-1 pr-4 py-3 focus:outline-none bg-transparent" 
                style={{fontSize:'16px'}} 
              />
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-1">Only visible to mutual matches — not shown on your public profile.</p>
          </div>

          {/* Location — only during onboarding */}
          {isOnboarding && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location <span className="text-gray-400 font-normal">— used to calculate distance</span>
              </label>
              {/* LocationPicker is NOT inside a scroll container — no double scroll bar */}
              <LocationPicker
                value={location}
                onChange={async (loc) => {
                  setLocation(loc);
                  setHasSaved(false);
                  
                  // Call POST /user/location
                  const token = localStorage.getItem('parallel_access_token');
                  if (token) {
                    try {
                      await fetch(`${EDGE_FUNCTION_URL}/user/location`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`,
                          'apikey': publicAnonKey,
                        },
                        body: JSON.stringify({
                          latitude: loc.latitude,
                          longitude: loc.longitude,
                          city: loc.city,
                          country: loc.country,
                          locationDisplay: loc.locationDisplay,
                        }),
                      });
                    } catch (err) {
                      console.error('Failed to save location:', err);
                    }
                  }
                }}
              />
            </div>
          )}

        </div>

        {/* Fixed save button at bottom — constrained to match content max-width */}
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className="max-w-[390px] mx-auto bg-white border-t border-gray-100 px-6 py-4 space-y-2">
            <button
              onClick={handleComplete}
              disabled={!canSave || isUploading || isSaving}
              className="w-full py-4 px-6 rounded-full bg-black text-white font-medium text-base transition-all hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving…</span>
                </>
              ) : hasSaved && !isSaving ? '✓ Saved' : isOnboarding ? 'Finish Profile' : 'Save Profile'}
            </button>
            {!canSave && (
              <p className="text-center text-sm text-gray-400">Add at least one photo to continue</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}