$(document).ready(function() {
	$('#add-stock').click(function(e) {
		$.ajax({
			type: 'POST',
			url: '/add-stock',
			data: {stock: $('#stock').val()},
			success: function(price) {
				$('.stock-list').append('<tr><td>' + $('#stock').val() + '</td><td>' + price + '</td></tr>');
			}
		});
	});
});
