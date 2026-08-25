from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.storage import users

router = APIRouter(tags=["Authentication"])

class SignupRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/signup")
def signup(request: SignupRequest):
    if request.username in users:
        raise HTTPException(status_code=400, detail="User already exists")
    users[request.username] = {"password": request.password, "alerts": []}
    return {"message": "User created"}

@router.post("/login")
def login(request: LoginRequest):
    if request.username not in users or users[request.username]["password"] != request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"message": "Login success"}

@router.get("/alerts/{username}")
def get_alerts(username: str):
    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")
    return users[username]["alerts"]
