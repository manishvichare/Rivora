from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth import get_current_business

router = APIRouter(prefix="/requirements", tags=["requirements"])
# Named 'requirements' (not 'requests') in the URL to avoid clashing with
# Python's own `requests` library name in imports/tooling.


@router.post("", response_model=schemas.RequirementOut, status_code=201)
def post_requirement(
    payload: schemas.RequirementCreate,
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    req = models.ResourceRequest(seeker_id=current.id, **payload.model_dump())
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("", response_model=list[schemas.RequirementOut])
def list_open_requirements(db: Session = Depends(get_db)):
    """Lets providers browse open requirements to proactively pitch a match."""
    return db.query(models.ResourceRequest).filter(models.ResourceRequest.status == "open").all()


@router.get("/mine", response_model=list[schemas.RequirementOut])
def my_requirements(
    db: Session = Depends(get_db),
    current: models.Business = Depends(get_current_business),
):
    return db.query(models.ResourceRequest).filter(models.ResourceRequest.seeker_id == current.id).all()
