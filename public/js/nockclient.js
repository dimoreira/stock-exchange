$(document).ready(function() {
	$('.uname').blur(function(e) {
		$.ajax({
			type: 'GET',
			url: '/api/users/' + $('.uname').val(),
			success: function(response) {
				if (response == '1') {
					$('#imagePlaceholder').html('<img src="http://spbooks.github.io/nodejs1/cross.png" alt="cross"> Username already taken');
					$('.create-button').addClass('disabled').attr('disabled', true);
				} else {
					$('#imagePlaceholder').html('<img src="http://spbooks.github.io/nodejs1/tick.png" alt="tick">');
					$('.create-button').removeClass('disabled').attr('disabled', false);
				}
			}
		});
	});
});