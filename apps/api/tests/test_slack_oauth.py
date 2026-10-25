from gigsnano_api.sync.slack_oauth import FakeSlackOAuth


async def test_fake_authorize_url_carries_state():
    oauth = FakeSlackOAuth()
    url = oauth.authorize_url("abc.def")
    assert "state=abc.def" in url


async def test_fake_exchange_and_channels_round_trip():
    oauth = FakeSlackOAuth()
    result = await oauth.exchange_code("some-code")
    assert result.access_token == "fake-slack-token"
    assert result.team_id and result.team_name and result.bot_user_id

    channels = await oauth.list_channels(result.access_token)
    assert len(channels) == 3
    assert all(c.id and c.name for c in channels)
