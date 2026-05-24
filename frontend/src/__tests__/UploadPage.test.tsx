import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { UploadPage } from "@/pages/UploadPage";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("UploadPage", () => {
  it("renders upload heading", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("上传图片")).toBeInTheDocument();
  });

  it("renders folder selector", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("默认文件夹")).toBeInTheDocument();
  });

  it("renders album selector", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("不加入相册")).toBeInTheDocument();
  });

  it("renders AI toggle labels", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("AI 描述")).toBeInTheDocument();
    expect(screen.getByText("人脸识别")).toBeInTheDocument();
  });

  it("renders drop zone", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("拖拽图片文件或文件夹到此处")).toBeInTheDocument();
  });

  it("renders select file button", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("选择文件")).toBeInTheDocument();
  });

  it("renders upload history section", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("上传历史")).toBeInTheDocument();
  });

  it("shows empty state when no uploads", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("暂无上传记录")).toBeInTheDocument();
  });

  it("renders history limit selector", () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText("最近 20 张")).toBeInTheDocument();
  });
});
