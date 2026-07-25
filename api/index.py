import os
import sys

# Add parent directory to path so that Vercel python resolver can find 'backend' modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app
