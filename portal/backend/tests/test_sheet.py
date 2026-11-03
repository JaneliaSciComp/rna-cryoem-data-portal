import pytest

from rna_portal.sheet import collections

# The sheet tab's shape: a title, a blank row, then the header.
CSV = """\
DATA COLLECTION PARAMETERS FOR THE RNA PORTAL,,,,
,,,,
Index,Date,Grid Name,Pixel Size (Å),Movies
1,2025/01/01,Grid1 b1g1,0.7252,
2,2025/01/02,Mol9_gRNAde,0.7336,12345
3,2025/01/03,Mol9_gRNAde,0.7252,12000
4,,,,
"""


def test_collections_groups_rows_by_grid_name():
    assert collections(CSV) == {
        "Grid1 b1g1": [{"Index": "1", "Date": "2025/01/01", "Pixel Size (Å)": "0.7252"}],
        "Mol9_gRNAde": [
            {"Index": "2", "Date": "2025/01/02", "Pixel Size (Å)": "0.7336", "Movies": "12345"},
            {"Index": "3", "Date": "2025/01/03", "Pixel Size (Å)": "0.7252", "Movies": "12000"},
        ],
    }


@pytest.mark.parametrize("text", [
    "", "Index,Date,Name\n1,2025/01/01,Mol9_gRNAde\n",
    "Grid Name,Movies,Movies\nMol9_gRNAde,1,2\n",  # a duplicate column would silently win
])
def test_collections_without_a_usable_header_row_is_an_error(text):
    with pytest.raises(ValueError):
        collections(text)
