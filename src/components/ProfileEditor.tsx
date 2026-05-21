import { useState, useRef } from 'react';
import { Upload, X, GripVertical, ChevronLeft, Briefcase, GraduationCap, Instagram, MapPin, Plus, Wine, Cigarette, PawPrint, Church, Vote, ShieldCheck, Lock } from 'lucide-react';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { LocationPicker } from './LocationPicker';
import { getAccessToken } from '../utils/auth';

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
      state: string;
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
    state: string;
    country: string;
    locationDisplay: string;
  };
  // ── Preview-only props ───────────────────────────────────────
  // These don't change anything the user is editing — they only feed the
  // "Preview" overlay so it can render like a real match card. The fields
  // below are derived from the questionnaire answers and live in App
  // state, so we plumb them through here. All optional so onboarding
  // (which doesn't yet have full answers) keeps working.
  userAnswers?: Record<string, any>;
  userDateOfBirth?: string;
  isVerified?: boolean;
}

function normalizePronouns(val: string): string {
  const trimmed = val.trim().toLowerCase();
  if (!trimmed) return '';
  // Already slash-formatted: clean up whitespace around slashes only
  if (trimmed.includes('/')) return trimmed.replace(/\s*\/\s*/g, '/');
  // Space-separated (e.g. "she her") → "she/her"
  return trimmed.replace(/\s+/g, '/');
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
  userAnswers,
  userDateOfBirth,
  isVerified = false,
}: ProfileEditorProps) {
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>(initialPhotos);
  const [bio, setBio] = useState(initialBio);
  const [career, setCareer] = useState(initialCareer);
  const [education, setEducation] = useState(initialEducation);
  const [instagram, setInstagram] = useState(initialInstagram);
  const [pronouns, setPronouns] = useState(normalizePronouns(initialPronouns));
  const [location, setLocation] = useState(initialLocation);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = initialName.trim() || 'Your Name';
  const firstName = displayName.split(' ')[0];

  // ── Preview-only derived data ────────────────────────────────
  // Pulls match-card fields from the questionnaire answers, exactly the way
  // MatchProfileView reads them on a real card. Wrapped in a helper because
  // answer values can be either { value: x, isDealbreaker: y } objects (post-
  // dealbreaker) or raw values (legacy / onboarding). Keep it tolerant.
  const ans = (id: string): any => {
    const v = userAnswers?.[id];
    if (v === null || v === undefined) return null;
    return typeof v === 'object' && 'value' in v ? v.value : v;
  };

  const userAge = userDateOfBirth
    ? Math.floor((Date.now() - new Date(userDateOfBirth).getTime()) / 31557600000)
    : null;

  // Q1.5 height — stored as { feet, inches, unit, cm }
  const heightAns = ans('1.5');
  const heightStr: string | null = (() => {
    if (!heightAns || typeof heightAns !== 'object') return null;
    if (heightAns.unit === 'cm' && heightAns.cm) return `${heightAns.cm} cm`;
    if (heightAns.feet !== undefined) return `${heightAns.feet}'${heightAns.inches || 0}"`;
    return null;
  })();

  // Q3.9 hobbies — stored as a string[]
  const hobbiesAns = ans('3.9');
  const hobbies: string[] = Array.isArray(hobbiesAns) ? hobbiesAns : [];

  const drinking: string | null = typeof ans('3.1') === 'string' ? ans('3.1') : null;
  const smoking: string | null = typeof ans('3.3') === 'string' ? ans('3.3') : null;
  const pets: string | null = typeof ans('3.8') === 'string' ? ans('3.8') : null;
  const politics: string | null = typeof ans('6.1') === 'string' ? ans('6.1') : null;
  const religion: string | null = typeof ans('6.2') === 'string' ? ans('6.2') : null;

  const profileDetails = [
    education ? { icon: GraduationCap, label: 'Education', value: education } : null,
    career ? { icon: Briefcase, label: 'Career', value: career } : null,
    religion ? { icon: Church, label: 'Religion', value: religion } : null,
    politics ? { icon: Vote, label: 'Politics', value: politics } : null,
    drinking ? { icon: Wine, label: 'Drinking', value: drinking } : null,
    smoking ? { icon: Cigarette, label: 'Smoking', value: smoking } : null,
    pets ? { icon: PawPrint, label: 'Pets', value: pets } : null,
  ].filter(Boolean) as { icon: any; label: string; value: string }[];

  const previewPhotos = uploadedPhotos;
  const goPrevPhoto = () => setPreviewPhotoIndex((i) => Math.max(0, i - 1));
  const goNextPhoto = () => setPreviewPhotoIndex((i) => Math.min(previewPhotos.length - 1, i + 1));

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (uploadedPhotos.length >= 6) { setUploadError('Maximum 6 photos allowed'); return; }
    const slotsRemaining = 6 - uploadedPhotos.length;
    if (files.length > slotsRemaining) {
      setUploadError(`Only ${slotsRemaining} slot${slotsRemaining !== 1 ? 's' : ''} remaining — adding the first ${slotsRemaining} of ${files.length} selected.`);
    } else {
      setUploadError('');
    }
    setIsUploading(true);
    const token = await getAccessToken();
    if (!token) { setIsUploading(false); return; }

    const newPhotos: string[] = [];
    for (let i = 0; i < Math.min(files.length, slotsRemaining); i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) { setUploadError('Each photo must be under 10MB'); continue; }
      try {
        const strippedFile = await stripExifMetadata(file);
        const formData = new FormData();
        formData.append('photo', strippedFile);
        formData.append('position', String(uploadedPhotos.length + newPhotos.length));
        const res = await fetch(`${ONBOARDING_FUNCTION_URL}/photos/upload`, {
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
      const savedToken = await getAccessToken();
      if (savedToken) {
        fetch(`${ONBOARDING_FUNCTION_URL}/progress`, {
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
  const handleDragEnd = async () => {
    setDragIndex(null);
    // Persist reordered photos immediately so a refresh doesn't lose the new order
    const token = await getAccessToken();
    if (token && uploadedPhotos.length > 0) {
      fetch(`${ONBOARDING_FUNCTION_URL}/progress`, {
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
  // This must look IDENTICAL to a real match card so the user can see what
  // their profile looks like to potential matches. Lifts MatchProfileView's
  // exact structure verbatim:
  //   - max-w-2xl outer wrapper, pt-20 pb-40 spacing
  //   - aspect-[4/5] photo card with rounded-3xl border-2, page indicator
  //     dots at top of photo, Verified pill bottom-left, "Photo X of Y"
  //     caption below
  //   - Name+age+height heading OUTSIDE photo, location+pronouns subline
  //   - Bio as prose
  //   - Hobbies & Interests card
  //   - Profile Basics card with education / career / religion / politics /
  //     drinking / smoking / pets
  //   - Instagram locked-style pill
  //
  // Differences from a real match card (intentional, not bugs):
  //   - No compatibility breakdown bars (you don't have a score with self)
  //   - No compatibility pill in the photo bottom-right (same reason)
  //   - No Like/Pass action bar
  //   - No safety menu
  //   - Hobbies all rendered in gray (no "you both enjoy" comparison)
  if (showPreview) {
    return (
      <div className="min-h-screen bg-parallel-cream pb-20">
        {/* Sticky header — kept from previous preview so the user has a
            "Back to editing" anchor while reviewing the card. */}
        <div className="sticky top-0 bg-parallel-cream z-10 border-b border-gray-100 flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setShowPreview(false)}
            className="flex items-center gap-1 text-sm font-medium hover:text-gray-600"
          >
            <ChevronLeft size={18} aria-hidden="true" /> Back to editing
          </button>
          <span className="text-sm font-medium text-gray-500">Preview</span>
          <div className="w-28" />
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">

          {/* Photo carousel — lifted verbatim from MatchProfileView */}
          <div>
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden border-2 border-gray-200">
              {previewPhotos[previewPhotoIndex] ? (
                <img
                  src={previewPhotos[previewPhotoIndex]}
                  alt={`${displayName}, photo ${previewPhotoIndex + 1} of ${previewPhotos.length}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <p className="text-gray-500">No photo</p>
                </div>
              )}
              {previewPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-0 top-0 w-1/3 h-full z-10 cursor-pointer"
                    onClick={goPrevPhoto}
                    aria-label="Previous photo"
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 w-1/3 h-full z-10 cursor-pointer"
                    onClick={goNextPhoto}
                    aria-label="Next photo"
                  />
                  <div className="absolute top-3 left-0 right-0 flex justify-center gap-1 z-20" aria-hidden="true">
                    {previewPhotos.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1 rounded-full transition-all ${
                          idx === previewPhotoIndex ? 'w-5 bg-parallel-cream' : 'w-1.5 bg-parallel-cream/50'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
              {isVerified && (
                <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-blue-500 text-parallel-cream px-3 py-1.5 rounded-full shadow-lg">
                  <ShieldCheck size={13} aria-hidden="true" />
                  <span className="text-xs font-medium">Verified</span>
                </div>
              )}
            </div>
            {previewPhotos.length > 1 && (
              <p className="text-center text-xs text-gray-500 mt-2">
                Photo {previewPhotoIndex + 1} of {previewPhotos.length} — tap sides to browse
              </p>
            )}
          </div>

          {/* Name / age / height / location / pronouns */}
          <div>
            <h1 className="text-2xl font-bold">
              {displayName}{userAge ? `, ${userAge}` : ''}{heightStr ? ` · ${heightStr}` : ''}
            </h1>
            {(location?.locationDisplay || pronouns) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-gray-500 text-sm">
                {location?.locationDisplay && (
                  <div className="flex items-center gap-1">
                    <MapPin size={13} aria-hidden="true" />
                    <span>{location.locationDisplay}</span>
                  </div>
                )}
                {pronouns && <span>{pronouns}</span>}
              </div>
            )}
          </div>

          {/* Bio as prose (no gray card wrapper) */}
          {bio && (
            <p className="text-[15px] text-gray-700 leading-relaxed">{bio}</p>
          )}

          {/* Hobbies & Interests — self-preview shows all in gray since
              there's no "shared with you" comparison. */}
          {hobbies.length > 0 && (
            <div className="p-4 bg-parallel-cream rounded-2xl border-2 border-gray-200">
              <h3 className="text-sm font-semibold mb-3">Hobbies &amp; Interests</h3>
              <div className="flex flex-wrap gap-2">
                {hobbies.map((hobby) => (
                  <span key={hobby} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full">
                    {hobby}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Profile Basics */}
          {profileDetails.length > 0 && (
            <div className="p-4 bg-parallel-cream rounded-2xl border-2 border-gray-200">
              <h3 className="text-sm font-semibold mb-3">Profile Basics</h3>
              <div className="grid grid-cols-1 gap-3">
                {profileDetails.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <Icon size={16} className="text-gray-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-sm text-gray-800">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instagram — locked-style card matching what a non-mutual match
              would see. Mirrors MatchProfileView's "Unlocks after you both
              like each other" pattern so the user understands the privacy
              behavior. */}
          {instagram && (
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <Lock size={14} className="text-gray-500" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700">Instagram</p>
                <p className="text-xs text-gray-500">Unlocks for matches after you both like each other</p>
              </div>
              <Instagram size={16} className="text-gray-500 flex-shrink-0" aria-hidden="true" />
            </div>
          )}

          <p className="text-xs text-gray-500 text-center pt-4">
            This is how your profile appears to potential matches
          </p>
        </div>
      </div>
    );
  }

  // ── Editor view ──────────────────────────────────────────────
  // KEY FIX: Use a single scrollable page with no nested scroll containers.
  // Bottom padding ensures content is never hidden under the fixed save button.
  return (
    <div className="bg-parallel-cream flex flex-col h-[100dvh]">
      <div className="max-w-[390px] mx-auto bg-parallel-cream flex flex-col flex-1 w-full min-h-0">

        {/* Header */}
        <div className="flex-shrink-0 bg-parallel-cream z-10 border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-3">
            {onBack ? (
              <button onClick={onBack} aria-label="Back to account" className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-all">
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
            ) : <div className="w-10" />}
            <h1 className="text-base font-semibold flex-1 text-center">
              {isOnboarding ? `Create your profile, ${firstName}` : 'Edit Profile'}
            </h1>
            <button onClick={() => setShowPreview(true)} className="text-sm text-gray-500 hover:text-parallel-void transition-colors">
              Preview
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6 space-y-6" style={{ WebkitOverflowScrolling: 'touch' }}>

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
                  onContextMenu={e => e.preventDefault()}
                  className={`relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100 cursor-move border-2 transition-all ${dragIndex === index ? 'border-parallel-void opacity-70 scale-95' : 'border-transparent'} ${index === 0 ? 'ring-2 ring-black ring-offset-1' : ''}`}
                >
                  <img src={photo} alt={`Photo ${index + 1}`} draggable={false} className="w-full h-full object-cover pointer-events-none" />
                  {index === 0 && (
                    <div className="absolute top-1.5 left-1.5 bg-parallel-purple text-parallel-cream text-[10px] font-medium px-1.5 py-0.5 rounded-full">Main</div>
                  )}
                  <button onClick={() => handleRemovePhoto(index)}
                    aria-label={`Remove photo ${index + 1}`}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-parallel-void/60 rounded-full flex items-center justify-center hover:bg-parallel-void transition-colors"
                  >
                    <X size={12} className="text-parallel-cream" aria-hidden="true" />
                  </button>
                  <div className="absolute bottom-1.5 left-1.5 w-5 h-5 bg-parallel-void/40 rounded-full flex items-center justify-center" aria-hidden="true">
                    <GripVertical size={10} className="text-parallel-cream" />
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
                      isFirstEmpty && !isUploading ? 'cursor-pointer hover:border-gray-300 hover:text-gray-500 transition-colors' : ''
                    }`}
                  >
                    {isFirstEmpty && isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                        {/* Surfaces what's actually happening (PhotoDNA/content
                            scan + EXIF strip + upload). Without this the user
                            wonders if it's stuck. */}
                        <span className="text-[10px] text-gray-500 mt-1 px-1 text-center leading-tight">
                          Scanning your photo…
                        </span>
                      </>
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
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
              multiple={6 - uploadedPhotos.length > 1}
              className="hidden"
              onChange={e => { handlePhotoUpload(e.target.files); e.target.value = ''; }}
            />
          </div>

          {/* Career */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Career <span className="text-gray-500 font-normal">— shown on your profile</span>
            </label>
            <div className="relative">
              <Briefcase size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" value={career}
                onChange={e => { setCareer(e.target.value); setHasSaved(false); }}
                placeholder="e.g. Product Manager, Teacher, Nurse..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                style={{ fontSize: '16px' }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1 ml-1">This appears exactly as you type it on your profile.</p>
          </div>

          {/* Education */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Education <span className="text-gray-500 font-normal">— shown on your profile</span>
            </label>
            <div className="relative">
              <GraduationCap size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" value={education}
                onChange={e => { setEducation(e.target.value); setHasSaved(false); }}
                placeholder="e.g. University of Washington, Trade School..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              About Me <span className="text-gray-500 font-normal">— shown on your profile</span>
            </label>
            <textarea
              value={bio}
              onChange={e => { setBio(e.target.value.slice(0, 300)); setHasSaved(false); }}
              placeholder="Write a short bio — who you are, what you care about, what you're looking for..."
              rows={4}
              className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors resize-none"
              style={{ fontSize: '16px' }}
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-500 ml-1">Specific details make it easier to start a conversation.</p>
              <p className="text-xs text-gray-500">{bio.length}/300</p>
            </div>
          </div>

          {/* Pronouns */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pronouns <span className="text-gray-500 font-normal">— optional</span>
            </label>
            <input type="text" value={pronouns}
              onChange={e => { setPronouns(e.target.value); setHasSaved(false); }}
              onBlur={e => setPronouns(normalizePronouns(e.target.value))}
              placeholder="e.g. she/her, he/him, they/them..."
              className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
              style={{ fontSize: '16px' }}
            />
            {pronouns && <p className="text-xs text-amber-600 mt-1 ml-1">⚠ This will be shown on your public profile</p>}
          </div>

          {/* Instagram */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instagram <span className="text-gray-500 font-normal">— optional, shown after mutual match</span>
            </label>
            <div className="flex items-center rounded-2xl border-2 border-gray-200 focus-within:border-parallel-purple transition-colors overflow-hidden">
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
            <p className="text-xs text-gray-500 mt-1 ml-1">Only visible to mutual matches — not shown on your public profile.</p>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location <span className="text-gray-500 font-normal">— used to calculate distance</span>
            </label>
            {/* LocationPicker is NOT inside a scroll container — no double scroll bar */}
            <LocationPicker
              value={location}
              onChange={async (loc) => {
                setLocation(loc);
                setHasSaved(false);

                // Call POST /user/location
                const token = await getAccessToken();
                if (token) {
                  try {
                    await fetch(`${ONBOARDING_FUNCTION_URL}/user/location`, {
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
                        state: loc.state,
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

        </div>

        {/* Sticky save button — anchored to bottom of flex container, stays above keyboard */}
        <div className="flex-shrink-0">
          <div className="bg-parallel-cream border-t border-gray-100 px-6 py-4 space-y-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button
              onClick={handleComplete}
              disabled={!canSave || isUploading || isSaving}
              className="w-full py-4 px-6 rounded-full bg-parallel-purple text-parallel-cream font-medium text-base transition-all hover:bg-parallel-purple/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving…</span>
                </>
              ) : hasSaved && !isSaving ? '✓ Saved' : isOnboarding ? 'Finish Profile' : 'Save Profile'}
            </button>
            {!canSave && (
              <p className="text-center text-sm text-gray-500">Add at least one photo to continue</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
