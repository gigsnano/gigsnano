import sqlalchemy as sa

from gigsnano_api.models import Story


def test_sort_order_column_is_float():
    # SQLite's dynamic typing round-trips a fractional value even through an
    # Integer column, so this column-type check is what actually goes red
    # before the model change (Postgres would truncate/reject it).
    assert isinstance(Story.__table__.c.sort_order.type, sa.Float)


async def test_sort_order_stores_fractional_value(db_session, make_project):
    project = await make_project()
    story = Story(
        project_id=project.id,
        title="Fractional sort",
        sort_order=32767.5,
        story_number=1,
    )
    db_session.add(story)
    await db_session.commit()
    await db_session.refresh(story)

    assert story.sort_order == 32767.5
