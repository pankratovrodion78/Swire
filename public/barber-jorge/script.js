// Navbar scroll effect
window.addEventListener('scroll', function() {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// Mobile menu toggle
document.getElementById('navToggle').addEventListener('click', function() {
  document.getElementById('navLinks').classList.toggle('open');
});

// Close mobile menu on link click
document.querySelectorAll('.nav-links a').forEach(function(link) {
  link.addEventListener('click', function() {
    document.getElementById('navLinks').classList.remove('open');
  });
});

// Booking form: multi-step navigation
function goToStep(stepNum) {
  if (stepNum === 2) {
    var service = document.querySelector('input[name="service"]:checked');
    if (!service) { alert('Please select a service.'); return; }
  }
  if (stepNum === 3) {
    var date = document.getElementById('date').value;
    var time = document.getElementById('time').value;
    if (!date || !time) { alert('Please pick both a date and time.'); return; }
  }

  document.querySelectorAll('.form-step').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('step' + stepNum).classList.add('active');

  document.querySelectorAll('.step-dot').forEach(function(dot) {
    var ds = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'done');
    if (ds === stepNum) dot.classList.add('active');
    else if (ds < stepNum) dot.classList.add('done');
  });
}

// Set min date to today
(function setMinDate() {
  var dateInput = document.getElementById('date');
  if (dateInput) {
    var today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
  }
})();

// Form submission
document.getElementById('bookingForm').addEventListener('submit', function(e) {
  e.preventDefault();

  var service = document.querySelector('input[name="service"]:checked').value;
  var date = document.getElementById('date').value;
  var time = document.getElementById('time').value;
  var name = document.getElementById('name').value;
  var phone = document.getElementById('phone').value;
  var notes = document.getElementById('notes').value;

  var dateObj = new Date(date + 'T12:00:00');
  var formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Save to localStorage
  var bookings = JSON.parse(localStorage.getItem('barberJorgeBookings') || '[]');
  bookings.push({ service: service, date: date, time: time, name: name, phone: phone, notes: notes, createdAt: new Date().toISOString() });
  localStorage.setItem('barberJorgeBookings', JSON.stringify(bookings));

  // Show confirmation
  document.getElementById('confirmDetails').innerHTML =
    '<strong>Service:</strong> ' + service + '<br/>' +
    '<strong>Date:</strong> ' + formattedDate + '<br/>' +
    '<strong>Time:</strong> ' + time + '<br/>' +
    '<strong>Name:</strong> ' + name + '<br/>' +
    '<strong>Phone:</strong> ' + phone +
    (notes ? '<br/><strong>Notes:</strong> ' + notes : '');

  document.querySelectorAll('.form-step').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('stepConfirm').classList.add('active');

  document.querySelectorAll('.step-dot').forEach(function(dot) { dot.classList.add('done'); });
});

function resetForm() {
  document.getElementById('bookingForm').reset();
  goToStep(1);
}
