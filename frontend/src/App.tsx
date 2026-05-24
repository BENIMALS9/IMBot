import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { GalleryPage } from "@/pages/GalleryPage";
import { ImageDetailPage } from "@/pages/ImageDetailPage";
import { UploadPage } from "@/pages/UploadPage";
import { PersonsPage } from "@/pages/PersonsPage";
import { PersonDetailPage } from "@/pages/PersonDetailPage";
import { AlbumsPage } from "@/pages/AlbumsPage";
import { FoldersPage } from "@/pages/FoldersPage";
import { AlbumDetailPage } from "@/pages/AlbumDetailPage";
import { SearchPage } from "@/pages/SearchPage";
import { SettingsPage } from "@/pages/SettingsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!token) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  const { checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="images/:id" element={<ImageDetailPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="persons" element={<PersonsPage />} />
        <Route path="persons/:id" element={<PersonDetailPage />} />
        <Route path="folders" element={<FoldersPage />} />
        <Route path="albums" element={<AlbumsPage />} />
        <Route path="albums/:id" element={<AlbumDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
