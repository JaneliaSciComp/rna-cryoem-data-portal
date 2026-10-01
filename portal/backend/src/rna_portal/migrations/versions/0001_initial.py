"""initial catalog

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "molecule",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("pdb_id", sa.Text),
        sa.Column("resolution_a", sa.Float),
        sa.Column("thumbnail_path", sa.Text),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "molecule_file",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "molecule_id",
            sa.Text,
            sa.ForeignKey("molecule.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("path", sa.Text, nullable=False, unique=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("size", sa.BigInteger, nullable=False),
        sa.Column("mtime", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("molecule_file")
    op.drop_table("molecule")
