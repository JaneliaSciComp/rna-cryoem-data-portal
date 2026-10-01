"""The catalog: one molecule per top-level Drive folder, one row per file the scanner recognizes."""
from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Kind(StrEnum):
    MODEL = "model"
    MAP = "map"
    PLOT = "plot"
    MICROGRAPH = "micrograph"
    REPORT = "report"
    LOG = "log"


class Source(StrEnum):
    DEPOSITED = "deposited"
    PREDICTED = "predicted"
    EXPERIMENTAL = "experimental"
    OTHER = "other"


class Base(DeclarativeBase):
    pass


class Molecule(Base):
    __tablename__ = "molecule"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # the folder name
    name: Mapped[str] = mapped_column(Text)
    pdb_id: Mapped[str | None] = mapped_column(Text)
    resolution_a: Mapped[float | None] = mapped_column(Float)
    thumbnail_path: Mapped[str | None] = mapped_column(Text)  # relative to the thumbnail dir
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # last change
    files: Mapped[list["MoleculeFile"]] = relationship(
        back_populates="molecule",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MoleculeFile.path",
    )


class MoleculeFile(Base):
    __tablename__ = "molecule_file"

    id: Mapped[int] = mapped_column(primary_key=True)
    molecule_id: Mapped[str] = mapped_column(
        ForeignKey("molecule.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(Text, unique=True)  # relative to the data root
    # Text, not Postgres enums: a new kind is a code change, not an ALTER TYPE migration.
    kind: Mapped[str] = mapped_column(String(16))
    source: Mapped[str] = mapped_column(String(16))
    size: Mapped[int] = mapped_column(BigInteger)
    mtime: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    molecule: Mapped[Molecule] = relationship(back_populates="files")
