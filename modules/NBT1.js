// Ignition status
// Exx : 4F8 -> 00 42 FE 01 FF FF FF FF
// Fxx : 12F -> 37 7C 8A DD D4 05 33 6B
function decode_ignition(data) {
	// Bounce if not enabled
	if (config.emulate.nbt1 !== true && config.retrofit.nbt1 !== true) return;

	data.command = 'bro';
	data.value   = 'Ignition status';

	log.module('Ignition message ' + Buffer.from(data.msg));

	return data;
}

// Used for iDrive knob rotational initialization
function decode_status(data) {
	// Bounce if not enabled
	if (config.emulate.nbt1 !== true && config.retrofit.nbt1 !== true) return;

	data.command = 'con';
	data.value   = 'NBT1 init iDrive knob';

	log.module('NBT1 status message ' + Buffer.from(data.msg));

	return data;
}


function init_listeners() {
	// Bounce if not enabled
	if (config.emulate.nbt1 !== true && config.retrofit.nbt1 !== true) return;

	// Perform commands on power lib active event
	update.on('status.power.active', (data) => {
		status_ignition(data.new);
	});

	log.module('Initialized listeners');
}


// Parse data sent to module
function parse_in(data) {
	// Bounce if not enabled
	if (config.emulate.nbt1 !== true) return;

	switch (data.msg[0]) {
		default : {
			data.command = 'unk';
			data.value   = Buffer.from(data.msg);
		}
	}

	log.bus(data);
}

// Parse data sent from module
function parse_out(data) {
	// Bounce if not enabled
	if (config.retrofit.nbt1 !== true) return;

	switch (data.src.id) {
		case 0x273 : data = decode_status(data); break;

		case 0x277 : { // NBT1 ACK to rotational initialization message
			data.command = 'rep';
			data.value   = 'NBT1 => NBT1 : ACK init';
			break;
		}

		case 0x12F :
		case 0x4F8 : data = decode_ignition(data); break;

		default : {
			data.command = 'unk';
			data.value   = Buffer.from(data.msg);
		}
	}

	// log.bus(data);
}


// Ignition status
function status_ignition(state = true) {
	// Bounce if not enabled
	if (config.retrofit.con1 !== true && config.retrofit.nbt1 !== true) return;

	// Handle setting/unsetting timeout
	switch (state) {
		case false : {
			// Return here if timeout is already null
			if (NBT1.timeout.status_ignition === null) return;

			clearTimeout(NBT1.timeout.status_ignition);
			NBT1.timeout.status_ignition = null;

			log.module('Unset ignition status timeout');
			// Return here since we're not re-sending again
			return;
		}

		case true : {
			if (NBT1.timeout.status_ignition !== null) break;
			log.module('Set ignition status timeout');
		}
	}


	// Default is NBT1 message
	let msg = {
		bus  : 'can1',
		id   : 0x12F,
		data : [ 0x37, 0x7C, 0x8A, 0xDD, 0xD4, 0x05, 0x33, 0x6B ],
	};

	switch (config.nbt1.mode.toLowerCase()) {
		case 'cic' : {
			msg.id   = 0x4F8;
			msg.data = [ 0x00, 0x42, 0xFE, 0x01, 0xFF, 0xFF, 0xFF, 0xFF ];
		}
	}

	// This is pretty noisy due to 200ms timeout
	// log.module('Sending ignition status');

	// Convert data array to Buffer
	msg.data = Buffer.from(msg.data);

	// Send message
	bus.data.send(msg);

	NBT1.timeout.status_ignition = setTimeout(status_ignition, 200);
}

// NBT1 status
// 273 -> 1D E1 00 F0 FF 7F DE 04
function status_nbt() {
	// Bounce if not enabled
	if (config.emulate.nbt1 !== true) return;

	log.module('Sending NBT1 status');

	bus.data.send({
		bus  : 'can1',
		id   : 0x273,
		data : Buffer.from([ 0x1D, 0xE1, 0x00, 0xF0, 0xFF, 0x7F, 0xDE, 0x04 ]),
	});

	// When NBT1 sends this message, NBT1 resets it's relative rotation counter to -1
	update.status('con1.rotation.relative', -1);
}


module.exports = {
	timeout : {
		status_ignition : null,
	},

	// Functions
	init_listeners : init_listeners,

	parse_in  : parse_in,
	parse_out : parse_out,

	status_ignition : status_ignition,
	status_nbt      : status_nbt,
};
