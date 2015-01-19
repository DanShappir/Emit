(function () {
	'use strict';
	
	Emit.events('mousemove', window)
		.sync(Emit.animationFrames())
		.until(Emit.events('click', window))
		.map(function (v) {
			return v[0];
		}).filter(function (ev) {
			return ev.clientX < 600;
		}).forEach(function (ev) {
			this.transform = 'translate3d(' + ev.clientX + 'px,' + ev.clientY + 'px,0)';
		}.bind(document.querySelector('div').style));

	Emit.promise(Emit.events('click', window)).then(function () { alert('bye'); });
}());
