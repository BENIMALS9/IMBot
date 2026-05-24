import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data: { username: string; password: string; email?: string }) =>
    api.post("/auth/register", data),
  login: (data: { username: string; password: string }) =>
    api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
  updateProfile: (data: { username?: string; email?: string; password?: string }) =>
    api.put("/auth/me", data),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/auth/me/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  avatarUrl: () => {
    const token = localStorage.getItem("token");
    return `/api/auth/me/avatar?token=${token}`;
  },
};

// Images
export const imagesApi = {
  list: (params?: Record<string, any>) => api.get("/images", { params }),
  get: (id: string) => api.get(`/images/${id}`),
  update: (id: string, data: Record<string, any>) => api.put(`/images/${id}`, data),
  delete: (id: string) => api.delete(`/images/${id}`),
  recent: (limit: number = 20) => api.get("/images/recent", { params: { limit } }),
  upload: (formData: FormData, onProgress?: (pct: number) => void) =>
    api.post("/images/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => onProgress?.(Math.round((e.progress ?? 0) * 100)),
    }),
  thumbnailUrl: (id: string) => {
    const token = localStorage.getItem("token");
    return `/api/images/${id}/thumbnail?token=${token}`;
  },
  originalUrl: (id: string) => {
    const token = localStorage.getItem("token");
    return `/api/images/${id}/original?token=${token}`;
  },
  reprocess: (id: string) => api.post(`/images/${id}/reprocess`),
};

// Folders
export const foldersApi = {
  list: () => api.get("/folders"),
  create: (data: Record<string, any>) => api.post("/folders", null, { params: data }),
  delete: (id: string) => api.delete(`/folders/${id}`),
  update: (id: string, data: Record<string, any>) =>
    api.put(`/folders/${id}`, null, { params: data }),
};

// Categories
export const categoriesApi = {
  list: () => api.get("/categories"),
  create: (data: Record<string, any>) => api.post("/categories", null, { params: data }),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Persons
export const personsApi = {
  list: () => api.get("/persons"),
  unknown: () => api.get("/persons/unknown"),
  getImages: (id: string, params?: { page?: number; page_size?: number }) =>
    api.get(`/persons/${id}/images`, { params }),
  update: (id: string, data: Record<string, any>) => api.put(`/persons/${id}`, null, { params: data }),
  delete: (id: string) => api.delete(`/persons/${id}`),
  faceThumbnailUrl: (id: string) => {
    const token = localStorage.getItem("token");
    return `/api/persons/${id}/face-thumbnail?token=${token}`;
  },
};

// Albums
export const albumsApi = {
  list: () => api.get("/albums"),
  get: (id: string, params?: { page?: number; page_size?: number }) =>
    api.get(`/albums/${id}`, { params }),
  create: (data: Record<string, any>) => api.post("/albums", null, { params: data }),
  update: (id: string, data: Record<string, any>) => api.put(`/albums/${id}`, null, { params: data }),
  delete: (id: string) => api.delete(`/albums/${id}`),
  addImages: (id: string, imageIds: string[]) =>
    api.post(`/albums/${id}/images`, { image_ids: imageIds }),
  removeImage: (albumId: string, imageId: string) =>
    api.delete(`/albums/${albumId}/images/${imageId}`),
};

// Search
export const searchApi = {
  search: (params?: Record<string, any>) => api.get("/search", { params }),
  suggestions: (params?: Record<string, any>) => api.get("/search/suggestions", { params }),
};

// Admin
export const adminApi = {
  status: () => api.get("/admin/status"),
  seedCategories: () => api.post("/admin/seed-categories"),
};

export default api;
