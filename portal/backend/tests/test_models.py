from datetime import datetime, timezone

from sqlalchemy import delete, inspect, select
from sqlalchemy.orm import Session

from rna_portal.models import Molecule, MoleculeFile

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def test_migration_creates_tables(engine):
    assert {"molecule", "molecule_file", "alembic_version"} <= set(
        inspect(engine).get_table_names()
    )


def test_deleting_a_molecule_deletes_its_files(engine):
    with Session(engine) as s:
        s.add(
            Molecule(
                id="Mol9_gRNAde",
                name="gRNAde",
                scanned_at=NOW,
                files=[
                    MoleculeFile(
                        path="Mol9_gRNAde/PDB_deposit/10ZT.pdb",
                        kind="model",
                        source="deposited",
                        size=1,
                        mtime=NOW,
                    )
                ],
            )
        )
        s.commit()
        # A SQL-level delete, as the scanner does: exercises ON DELETE CASCADE, not the ORM.
        s.execute(delete(Molecule).where(Molecule.id == "Mol9_gRNAde"))
        s.commit()
        assert s.scalars(select(MoleculeFile)).all() == []
