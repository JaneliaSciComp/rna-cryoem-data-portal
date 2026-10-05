import pytest

from rna_portal.render import heavy_atom_positions


def pdb_atom(serial: int, name: str, element: str, x: float, y: float, z: float) -> str:
    return (
        f"ATOM  {serial:5d} {name:<4} {'A':>3} A{1:4d}    "
        f"{x:8.3f}{y:8.3f}{z:8.3f}{1.0:6.2f}{0.0:6.2f}          {element:>2}\n"
    )


def test_positions_from_pdb_skip_hydrogens(tmp_path):
    p = tmp_path / "m.pdb"
    p.write_text(pdb_atom(1, "P", "P", 1, 2, 3) + pdb_atom(2, "H1", "H", 4, 5, 6) + "END\n")
    assert heavy_atom_positions(p) == [pytest.approx((1.0, 2.0, 3.0))]


def test_positions_from_mmcif(tmp_path):
    p = tmp_path / "m.cif"
    p.write_text(
        "data_test\nloop_\n"
        "_atom_site.group_PDB\n_atom_site.id\n_atom_site.type_symbol\n_atom_site.label_atom_id\n"
        "_atom_site.label_alt_id\n"
        "_atom_site.label_comp_id\n_atom_site.label_asym_id\n_atom_site.label_seq_id\n"
        "_atom_site.Cartn_x\n_atom_site.Cartn_y\n_atom_site.Cartn_z\n"
        "_atom_site.auth_asym_id\n_atom_site.auth_seq_id\n_atom_site.pdbx_PDB_model_num\n"
        "ATOM 1 P P . A A 1 1.0 2.0 3.0 A 1 1\n"
        "ATOM 2 H H1 . A A 1 4.0 5.0 6.0 A 1 1\n"
    )
    assert heavy_atom_positions(p) == [pytest.approx((1.0, 2.0, 3.0))]
