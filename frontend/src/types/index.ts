export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  avatar_path: string | null;
}

export interface ImageItem {
  id: string;
  folder_id: string;
  filename: string;
  original_name: string | null;
  thumbnail_path: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  date_taken: string | null;
  camera_model: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  location_name: string | null;
  caption_ai: string | null;
  processing_status: string | null;
  user_notes: string | null;
  created_at: string;
}

export interface RecentUpload {
  id: string;
  filename: string;
  original_name: string | null;
  thumbnail_path: string | null;
  caption_ai: string | null;
  processing_status: string;
  created_at: string | null;
  tasks: {
    task_type: string;
    status: string;
    error_message: string | null;
    completed_at: string | null;
  }[];
}

export interface ImageDetail extends ImageItem {
  lens_model: string | null;
  focal_length: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  iso: number | null;
  gps_altitude: number | null;
  exif_raw: Record<string, string> | null;
  categories: CategoryBrief[];
  persons: PersonBrief[];
  tags: string[];
}

export interface CategoryBrief {
  id: string;
  name: string;
  slug: string;
  confidence: number;
}

export interface PersonBrief {
  id: string;
  name: string;
  confidence: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  level: number;
  icon: string | null;
  children: CategoryNode[];
}

export interface PersonItem {
  id: string;
  name: string;
  slug: string;
  face_thumbnail: string | null;
  image_count: number;
  is_verified: boolean;
}

export interface FolderNode {
  id: string;
  name: string;
  description: string | null;
  image_count: number;
  children: FolderNode[];
}

export interface AlbumItem {
  id: string;
  name: string;
  description: string | null;
  is_smart: boolean;
  image_count: number;
}

export interface AlbumDetail {
  id: string;
  name: string;
  description: string | null;
  is_smart: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface SystemStatus {
  vlm_provider: string;
  enable_classification: boolean;
  enable_object_detection: boolean;
  enable_face_recognition: boolean;
  enable_vlm_caption: boolean;
  clip_model: string;
}
