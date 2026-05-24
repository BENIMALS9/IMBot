from pydantic import BaseModel


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    username: str
    email: str | None
    is_admin: bool
    avatar_path: str | None = None


class UpdateProfileRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str | None = None
