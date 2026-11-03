"""add the FSC 0.5 resolutions and the point group

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # parsers.PARSER_VERSION went up with these columns, so the next scan fills them in.
    op.add_column("molecule", sa.Column("fsc05_a", sa.Float))
    op.add_column("molecule", sa.Column("nomask_fsc05_a", sa.Float))
    op.add_column("molecule", sa.Column("point_group", sa.Text))


def downgrade() -> None:
    op.drop_column("molecule", "point_group")
    op.drop_column("molecule", "nomask_fsc05_a")
    op.drop_column("molecule", "fsc05_a")
