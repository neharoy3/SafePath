from sqlmodel import SQLModel, create_engine, Session
from fastapi import HTTPException
import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

# Get database URL from environment variable - default to SQLite for local development
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./safejourney.db"
)

# Create engine with appropriate settings based on database type
if "sqlite" in DATABASE_URL:
    # SQLite configuration for local development
    engine = create_engine(
        DATABASE_URL,
        echo=False,  # Set to True for SQL query logging
        connect_args={"check_same_thread": False}  # Required for SQLite
    )
else:
    # PostgreSQL/Supabase configuration for production
    engine = create_engine(
        DATABASE_URL,
        echo=False,  # Set to True for SQL query logging
        pool_pre_ping=True,  # Verify connections before using
        pool_size=5,  # Number of connections to maintain
        max_overflow=10,  # Additional connections beyond pool_size
        pool_recycle=3600,  # Recycle connections after 1 hour
        connect_args={
            "connect_timeout": 10,  # 10 second connection timeout
            "sslmode": "require"  # Require SSL for Supabase
        }
    )

def get_session():
    """Get database session with error handling"""
    try:
        with Session(engine) as session:
            yield session
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Database session error: {error_msg}")
        # Check if it's a connection error
        if "could not translate host name" in error_msg or "Name or service not known" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Database connection unavailable. Please check your database configuration or network connection."
            )
        raise

def is_database_available() -> bool:
    """Check if database is available"""
    try:
        from sqlalchemy import text
        with Session(engine) as session:
            session.exec(text("SELECT 1")).first()
        return True
    except Exception:
        return False

def init_db():
    try:
        import models
        SQLModel.metadata.create_all(engine)
        print("✅ Database tables initialized successfully")
    except Exception as e:
        print(f"❌ Error initializing database: {str(e)}")
        raise
