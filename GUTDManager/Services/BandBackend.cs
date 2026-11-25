using GUTDManager.Models;
using Supabase.Postgrest;
using Supabase.Gotrue;
using Supabase.Realtime.PostgresChanges;
using static Supabase.Realtime.PostgresChanges.PostgresChangesOptions;

namespace GUTDManager.Services;

public sealed class BandBackend
{
	private readonly Supabase.Client _client = new(
		SupabaseSettings.Url,
		SupabaseSettings.PublishableKey);
	private bool _initialized;
	private Guid? _bandId;
	private Supabase.Realtime.RealtimeChannel? _messageChannel;

	public event EventHandler<BandMessage>? MessageReceived;

	public bool IsSignedIn => _client.Auth.CurrentUser is not null;

	public async Task InitializeAsync()
	{
		if (_initialized)
			return;

		await _client.InitializeAsync();
		_initialized = true;
	}

	public async Task SignInAsync(string email, string password)
	{
		await InitializeAsync();
		await _client.Auth.SignIn(email, password);
	}

	public async Task SignUpAsync(string email, string password)
	{
		await InitializeAsync();
		await _client.Auth.SignUpAsync(
			Supabase.Gotrue.Constants.SignUpType.Email,
			email,
			password,
			new SignUpOptions());
	}

	public async Task SignOutAsync()
	{
		_messageChannel?.Unsubscribe();
		_messageChannel = null;
		await _client.Auth.SignOut();
		_bandId = null;
	}

	public async Task<Guid?> GetCurrentBandIdAsync()
	{
		await InitializeAsync();
		var user = _client.Auth.CurrentUser
			?? throw new InvalidOperationException("Sign in to access the band workspace.");
		var userId = RequireUserId(user);
		var membership = await FindMembershipAsync(userId);
		_bandId = membership?.BandId;
		return _bandId;
	}

	public async Task CreateBandAsync(string name)
	{
		await InitializeAsync();
		var user = _client.Auth.CurrentUser
			?? throw new InvalidOperationException("Sign in before creating a band.");
		var userId = RequireUserId(user);
		var created = await _client.From<BandSpace>().Insert(
			new BandSpace { Name = name.Trim(), CreatedBy = userId });
		var band = created.Models.FirstOrDefault()
			?? throw new InvalidOperationException("The band workspace could not be created.");
		_bandId = band.Id;
	}

	public async Task JoinBandAsync(string inviteCode)
	{
		await InitializeAsync();
		await _client.Rpc(
			"join_band_with_invite",
			new Dictionary<string, object> { ["p_invite_code"] = inviteCode.Trim() });
		_bandId = null;
		var bandId = await GetCurrentBandIdAsync();
		if (!bandId.HasValue)
			throw new InvalidOperationException("The invite was accepted, but no band membership was found.");
	}

	public async Task<string> CreateInviteAsync()
	{
		await InitializeAsync();
		var user = _client.Auth.CurrentUser
			?? throw new InvalidOperationException("Sign in before creating an invite.");
		var bandId = await GetCurrentBandIdAsync()
			?? throw new InvalidOperationException("Create or join a band before inviting members.");
		var result = await _client.From<BandInvite>().Insert(new BandInvite
		{
			BandId = bandId,
			CreatedBy = RequireUserId(user)
		});
		return result.Models.FirstOrDefault()?.InviteCode
			?? throw new InvalidOperationException("The invite code could not be created.");
	}

	public async Task<List<BandEvent>> LoadEventsAsync()
	{
		var bandId = await GetCurrentBandIdAsync()
			?? throw new InvalidOperationException("Create or join a band to view the calendar.");
		var result = await _client.From<BandEvent>()
			.Filter("band_id", Supabase.Postgrest.Constants.Operator.Equals, bandId.ToString())
			.Order("starts_at", Supabase.Postgrest.Constants.Ordering.Ascending)
			.Limit(100)
			.Get();
		return result.Models;
	}

	public async Task CreateEventAsync(string title, DateTime startsAt, string location)
	{
		var bandId = await GetCurrentBandIdAsync()
			?? throw new InvalidOperationException("Create or join a band before adding events.");
		await _client.From<BandEvent>().Insert(new BandEvent
		{
			BandId = bandId,
			Title = title.Trim(),
			StartsAt = startsAt,
			Location = location.Trim()
		});
	}

	public async Task<List<BandTask>> LoadTasksAsync()
	{
		var bandId = await GetCurrentBandIdAsync()
			?? throw new InvalidOperationException("Create or join a band to view tasks.");
		var result = await _client.From<BandTask>()
			.Filter("band_id", Supabase.Postgrest.Constants.Operator.Equals, bandId.ToString())
			.Order("created_at", Supabase.Postgrest.Constants.Ordering.Descending)
			.Limit(100)
			.Get();
		return result.Models;
	}

	public async Task CreateTaskAsync(string title, DateTime? dueAt)
	{
		var bandId = await GetCurrentBandIdAsync()
			?? throw new InvalidOperationException("Create or join a band before adding tasks.");
		await _client.From<BandTask>().Insert(new BandTask
		{
			BandId = bandId,
			Title = title.Trim(),
			DueAt = dueAt,
			Status = "open"
		});
	}

	public async Task ToggleTaskAsync(BandTask task)
	{
		var updatedTask = new BandTask
		{
			Id = task.Id,
			BandId = task.BandId,
			Title = task.Title,
			Details = task.Details,
			DueAt = task.DueAt,
			Status = task.Status == "done" ? "open" : "done"
		};
		await _client.From<BandTask>().Update(updatedTask);
		task.Status = updatedTask.Status;
	}

	public async Task<BandManagerReply> AskBandManagerAsync(string question, bool webResearch)
	{
		await InitializeAsync();
		var bandId = await GetCurrentBandIdAsync();
		if (!bandId.HasValue)
			throw new InvalidOperationException("Create or join a band before using the AI manager.");

		var accessToken = _client.Auth.CurrentSession?.AccessToken;
		if (string.IsNullOrWhiteSpace(accessToken))
			throw new InvalidOperationException("Your session expired. Sign in again.");

		var options = new Supabase.Functions.Client.InvokeFunctionOptions
		{
			Body = new Dictionary<string, object>
			{
				["question"] = question,
				["webResearch"] = webResearch
			}
		};
		return await _client.Functions.Invoke<BandManagerReply>(
			"band-manager",
			token: accessToken,
			options: options)
			?? throw new InvalidOperationException("The AI manager returned no response.");
	}

	public async Task<List<BandMessage>> LoadMessagesAsync()
	{
		await InitializeAsync();
		var bandId = await GetCurrentBandIdAsync()
			?? throw new InvalidOperationException("Create or join a band to view chat.");
		var result = await _client
			.From<BandMessage>()
			.Filter("band_id", Supabase.Postgrest.Constants.Operator.Equals, bandId.ToString())
			.Order("created_at", Supabase.Postgrest.Constants.Ordering.Ascending)
			.Limit(100)
			.Get();

		return result.Models;
	}

	public async Task SendMessageAsync(string text)
	{
		await InitializeAsync();
		var user = _client.Auth.CurrentUser
			?? throw new InvalidOperationException("Sign in before sending messages.");
		var userId = RequireUserId(user);
		var bandId = await GetCurrentBandIdAsync()
			?? throw new InvalidOperationException("Create or join a band before sending messages.");

		await _client.From<BandMessage>().Insert(new BandMessage
		{
			BandId = bandId,
			SenderId = userId,
			SenderEmail = user.Email ?? "Band member",
			Body = text.Trim()
		});
	}

	public async Task SubscribeToMessagesAsync()
	{
		await InitializeAsync();
		var bandId = await GetCurrentBandIdAsync();
		if (!bandId.HasValue)
			throw new InvalidOperationException("Create or join a band to use chat.");
		if (_messageChannel is not null)
			return;

		_messageChannel = _client.Realtime.Channel("band-messages");
		_messageChannel.OnPostgresChange((_, change) =>
		{
			var message = change.Model<BandMessage>();
			if (message is not null)
				MessageReceived?.Invoke(this, message);
		}, ListenType.Inserts, new PostgresChangesFilter { Table = "band_messages", Schema = "public" });
		await _messageChannel.Subscribe();
	}

	private async Task<BandMembership?> FindMembershipAsync(string userId)
	{
		var memberships = await _client.From<BandMembership>()
			.Filter("user_id", Supabase.Postgrest.Constants.Operator.Equals, userId)
			.Limit(1)
			.Get();

		return memberships.Models.FirstOrDefault();
	}

	private static string RequireUserId(Supabase.Gotrue.User user)
	{
		return string.IsNullOrWhiteSpace(user.Id)
			? throw new InvalidOperationException("The signed-in account did not return a user ID.")
			: user.Id;
	}

	[Supabase.Postgrest.Attributes.Table("band_members")]
	private sealed class BandMembership : Supabase.Postgrest.Models.BaseModel
	{
		[Supabase.Postgrest.Attributes.PrimaryKey("band_id", false)]
		public Guid BandId { get; set; }

		[Supabase.Postgrest.Attributes.Column("user_id")]
		public string UserId { get; set; } = string.Empty;
	}

	[Supabase.Postgrest.Attributes.Table("band_spaces")]
	private sealed class BandSpace : Supabase.Postgrest.Models.BaseModel
	{
		[Supabase.Postgrest.Attributes.PrimaryKey("id", false)]
		public Guid Id { get; set; }

		[Supabase.Postgrest.Attributes.Column("name")]
		public string Name { get; set; } = string.Empty;

		[Supabase.Postgrest.Attributes.Column("created_by")]
		public string CreatedBy { get; set; } = string.Empty;
	}
}
