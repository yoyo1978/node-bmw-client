const module_name = __filename.slice(__dirname.length + 1, -3);

// Allegedly required messages:
// Message asking the data from the unit
// message preventing the sleep mode
// message initializing the rotational knob
// message controlling intensity of the backlight


// iDrive controller button states:
// Press
// Release
// Hold


// The rotational knob is connected to a 16 bit counter
// whose value is sent out through the CAN bus


// Message examples:

// CIC status
// 273 -> 1D E1 00 F0 FF 7F DE 04

// Ignition status
// 4F8 -> 00 42 FE 01 FF FF FF FF

// Counter/heartbeat
// Byte 4 changes from one state to the other every 5 sec
// 2BA -> 00 00 00 00 10
// 2BA -> 00 00 00 00 20



function button_out(data) {
	let strings = {
		b3 : data.msg[3].toString(16).toUpperCase(),
		b4 : data.msg[4].toString(16).toUpperCase(),
		b5 : data.msg[5].toString(16).toUpperCase(),
		string : null,
	};

	strings.string = strings.b3+' '+strings.b4+' '+strings.b5;

	if (status.con1.last.string != strings.string) {
		status.con1.last.string = strings.string;
		console.log('%s %s %s', strings.b3, strings.b4, strings.b5);
	}
}


// iDrive knob rotation
// ARBID 0x264: <Buffer e1 fd b5 fb 7f 1e>
function decode_con_rotation(data) {
	// data.msg[2] : Counts up          between 0x00-0xFE : once every notch, regardless of the direction of turn.
	// data.msg[3] : Counts up and down between 0x00-0xFE : depending on the direction of rotation

	// so do the math .. i've had several beers

	if (data.msg[3] < status.con1.rotation.relative) {
		status.con1.rotation.direction = 'up';
	}

	// In the ghettoooooo
	if (data.msg[3] > status.con1.rotation.relative) {
		status.con1.rotation.direction = 'down';
	}

	let subtract = data.msg[3]-status.con1.rotation.relative;

	// Spin it hard enough and you can get it to jump up to 24 notches!

	// If we over-run and go backwards to go forwards
	// .... yeah, good luck, homie!

	// If you're clever, you can actually
	// use the math vs. the missed packets
	// to determine how hard the wheel was flicked
	if (subtract == 0) return;

	if (subtract == 255) {
		status.con1.rotation.direction = 'up';
	}
	else {
		if (subtract < -240) {
			status.con1.rotation.direction = 'down';
		}
		else {

			if (subtract > 0 && subtract < 25) {
				status.con1.rotation.direction = 'down';
			}
			else {
				status.con1.rotation.direction = 'up';
			}
		}
	}

	// Replace the data to the status object
	status.con1.rotation.absolute = data.msg[2];
	status.con1.rotation.relative = data.msg[3];

	log.msg({
		src : module_name,
		msg : 'Rotation: '+status.con1.rotation.direction,
	});

	if (status.con1.rotation.volume === true) {
		switch (status.con1.rotation.direction) {
			case 'up'   : kodi.volume('down');   break;
			case 'down' : kodi.volume('up'); break;
		}
		return;
	}

	if (status.con1.rotation.alternate === false) {
		kodi.input(status.con1.rotation.direction);
		return;
	}

	switch (status.con1.rotation.direction) {
		case 'up'   : kodi.input('left');  break;
		case 'down' : kodi.input('right'); break;
	}
}


// CON button press, length 6
function decode_con_button(data) {
	// Action bitmask data.msg[3]:
	// bit0 : Press
	// bit1 : Hold
	// bit2 : ??
	// bit3 : ??
	// bit4 : Joystick up
	// bit5 : Joystick right
	// bit6 : Joystick down
	// bit7 : Joystick left
	// bit8 : Release


	// Mode bitmask data.msg[4]:
	// 0xC0 : Button
	// 0xDD : Joystick
	// 0xDE : Push

	// MODE : BUTTON
	// bit0 : false
	// bit1 : false
	// bit2 : false
	// bit3 : false
	// bit4 : false
	// bit5 : false
	// bit6 : true
	// bit7 : true
	// bit8 : false

	// MODE : PUSH
	// bit0 : false
	// bit1 : true
	// bit2 : true
	// bit3 : true
	// bit4 : true
	// bit5 : false
	// bit6 : true
	// bit7 : true
	// bit8 : false

	// MODE : JOYSTICK
	// bit0 : true
	// bit1 : false
	// bit2 : true
	// bit3 : true
	// bit4 : true
	// bit5 : false
	// bit6 : true
	// bit7 : true
	// bit8 : false


	// Button bitmask data.msg[5]:
	// bit0 : Menu
	// bit1 : Back
	// bit2 : Option
	// bit3 : Radio
	// bit4 : CD
	// bit5 : Nav
	// bit6 : Tel
	// bit7 : Center?


	// button  : menu
	// press   : 01 c0 01
	// release : 00 c0 01

	// button  : in
	// press   : 01 de 01
	// release : 00 de 01


	// Decode bitmasks
	let m = {
		a : bitmask.check(data.msg[3]).mask, // mask actions
		m : bitmask.check(data.msg[4]).mask, // mask buttons
		b : bitmask.check(data.msg[5]).mask, // mask modes
	};

	let unmask = {
		actions : {},
		buttons : {},
		modes   : {},
	};

	// Detect 'mode' first, it determines what the button is
	unmask.modes = {
		button   : !m.m.bit0 && !m.m.bit1 && !m.m.bit2 && !m.m.bit3 && !m.m.bit4 && !m.m.bit5 &&  m.m.bit6 &&  m.m.bit7 && !m.m.bit8, // bit6+bit7 are true, all others false
		push     : !m.m.bit0 &&  m.m.bit1 &&  m.m.bit2 &&  m.m.bit3 &&  m.m.bit4 && !m.m.bit5 &&  m.m.bit6 &&  m.m.bit7 && !m.m.bit8, // bit0+bit5+bit8 are false, all others true
		joystick :  m.m.bit0 && !m.m.bit1 &&  m.m.bit2 &&  m.m.bit3 &&  m.m.bit4 && !m.m.bit5 &&  m.m.bit6 &&  m.m.bit7 && !m.m.bit8, // bit1+bit5+bit8 are false, all others true
	};

	// Loop unmask object to determine action+button combination
	for (let mode in unmask.modes) {
		if (unmask.modes[mode] === true) {
			unmask.mode = mode;
			break;
		}
	}

	unmask.actions = {
		press   :  m.a.bit0 && !m.a.bit1 && !m.a.bit8,
		hold    : !m.a.bit0 &&  m.a.bit1 && !m.a.bit8,
		release : !m.a.bit0 && !m.a.bit1 &&  m.a.bit8,
	};

	// Note how the joystick messages have their direction defined in bit3, not bit5
	unmask.buttons = {
		up    : unmask.modes.joystick &&  m.a.bit4 && !m.a.bit5 && !m.a.bit6 && !m.a.bit7,
		right : unmask.modes.joystick && !m.a.bit4 &&  m.a.bit5 && !m.a.bit6 && !m.a.bit7,
		down  : unmask.modes.joystick && !m.a.bit4 && !m.a.bit5 &&  m.a.bit6 && !m.a.bit7,
		left  : unmask.modes.joystick && !m.a.bit4 && !m.a.bit5 && !m.a.bit6 &&  m.a.bit7,
		none  : unmask.modes.joystick && !m.a.bit4 && !m.a.bit5 && !m.a.bit6 && !m.a.bit7, // All here are false

		in     : unmask.modes.push   &&  m.b.bit0 && !m.b.bit1 && !m.b.bit2 && !m.b.bit3 && !m.b.bit4 && !m.b.bit5 && !m.b.bit6,
		menu   : unmask.modes.button &&  m.b.bit0 && !m.b.bit1 && !m.b.bit2 && !m.b.bit3 && !m.b.bit4 && !m.b.bit5 && !m.b.bit6,
		back   : unmask.modes.button && !m.b.bit0 &&  m.b.bit1 && !m.b.bit2 && !m.b.bit3 && !m.b.bit4 && !m.b.bit5 && !m.b.bit6,
		option : unmask.modes.button && !m.b.bit0 && !m.b.bit1 &&  m.b.bit2 && !m.b.bit3 && !m.b.bit4 && !m.b.bit5 && !m.b.bit6,
		radio  : unmask.modes.button && !m.b.bit0 && !m.b.bit1 && !m.b.bit2 &&  m.b.bit3 && !m.b.bit4 && !m.b.bit5 && !m.b.bit6,
		cd     : unmask.modes.button && !m.b.bit0 && !m.b.bit1 && !m.b.bit2 && !m.b.bit3 &&  m.b.bit4 && !m.b.bit5 && !m.b.bit6,
		nav    : unmask.modes.button && !m.b.bit0 && !m.b.bit1 && !m.b.bit2 && !m.b.bit3 && !m.b.bit4 &&  m.b.bit5 && !m.b.bit6,
		tel    : unmask.modes.button && !m.b.bit0 && !m.b.bit1 && !m.b.bit2 && !m.b.bit3 && !m.b.bit4 && !m.b.bit5 &&  m.b.bit6,
	};

	// Loop unmask object to determine action+button combination
	for (let action in unmask.actions) {
		if (unmask.actions[action] === true) {
			unmask.action = action;
			break;
		}
	}

	for (let button in unmask.buttons) {
		if (unmask.buttons[button] === true) {
			unmask.button = button;
			break;
		}
	}

	button_check({
		action : unmask.action,
		button : unmask.button,
		mode   : unmask.mode,
	});
}

function button_check(button) {
	// Workaround for the last of a proper 'release' message when in 'joystick mode'
	let joystick_release = button.mode == 'joystick' && button.action == 'release' && button.button == 'none';
	if (joystick_release === true) button.button = status.con1.last.button.button;

	// Detect if there is a change from the last button message, bounce if not
	// CON sends a lot of repeat messages
	let change = status.con1.last.button.action != button.action || status.con1.last.button.button != button.button || status.con1.last.button.mode != button.mode;
	if (change === false) return;

	// Store buttonpress data in 'last' object
	status.con1.last.button = button;

	log.msg({
		src : module_name,
		msg : 'Button: '+button.action+' '+button.button,
	});

	if (button.action == 'press') {

		switch (button.button) {
			case 'nav':
				// To use the nav button as a toggle for left<->right or up<->down rotation
				update.status('con1.rotation.alternate', !status.con1.rotation.alternate);
				break;

			case 'cd':
				// To use the CD button as a toggle for rotation = Kodi volume control
				update.status('con1.rotation.volume', !status.con1.rotation.volume);
				break;

			default:
				kodi.input(button.button);
		}

	}
}


function decode_backlight(data) {
	// data.msg[0]: Backlight intensity
	// 0xFF      : 50%
	// 0xFE      :  0%
	// 0x00-0xFD :  1%-100%

	console.log('RECV : '+module_name+' backlight \'%s\'', data.msg[0]);
}

function decode_status_con(data) {
	// console.log('[%s] status', log.chalk.boldyellow('CON1'));
	if (data.msg[4] == 0x06) { // CON needs init
		log.msg({
			src : module_name,
			msg : 'Init triggered',
		});

		send_status_cic();
	}
}

function decode_ignition_new(data) {
	// console.log('Ignition message');
}

function decode_status_cic(data) {
	// console.log('CIC status message');
}

function send_heartbeat() {
	// 2BA -> 00 00 00 00 10
	// 2BA -> 00 00 00 00 20

	switch (status.con1.last.heartbeat) {
		case 0x10 : status.con1.last.heartbeat = 0x20; break;
		default   : status.con1.last.heartbeat = 0x10;
	}
}


function send_backlight(value) {
	// data.msg[0]: Backlight intensity
	// 0xFE      :  0%
	// 0x00-0xFD :  1%-100%
	// 0xFF      : 50%

	// Can't be > 0xFF || < 0x00
	if (value > 0xFF) value = 0xFF;
	if (value < 0x00) value = 0xFF;

	// Set status value
	status.con1.backlight = value;

	// Workarounds
	switch (value) {
		case 0x00: // 0% workaround
			value = 0xFE;
			break;

		case 0x7F: // 50% workaround
			value = 0xFF;
			break;

		case 0xFE: // Almost-100% workaround
			value = 0xFD;
			break;

		default: // Decrement value by one (see above)
			value--;
	}

	bus_data.send({
		bus  : 'can1',
		id   : 0x202,
		data : Buffer.from([value, 0x00]),
	});

	log.module({
		src : module_name,
		msg : 'Set backlight value to: '+status.con1.backlight,
	});
}

// E90 CIC status
function send_status_cic() {
	log.module({
		src : module_name,
		msg : 'Sending CIC status',
	});

	let msg = [0x1D, 0xE1, 0x00, 0xF0, 0xFF, 0x7F, 0xDE, 0x04];
	bus_data.send({
		bus  : 'can1',
		id   : 0x273,
		data : Buffer.from(msg),
	});

	status.con1.rotation.relative = -1;
}

// E90 Ignition status
function send_status_ignition_new() {
	log.module({
		src : module_name,
		msg : 'Sending ignition status',
	});

	bus_data.send({
		bus  : 'can1',
		id   : 0x4F8,
		data : Buffer.from([0x00, 0x42, 0xFE, 0x01, 0xFF, 0xFF, 0xFF, 0xFF]),
	});

	if (status.vehicle.ignition_level === 0) {
		if (CON1.timeouts.status_ignition_new !== null) {
			clearTimeout(CON1.timeouts.status_ignition_new);
			CON1.timeouts.status_ignition_new = null;

			log.module({
				src : module_name,
				msg : 'Unset ignition status timeout',
			});

			return;
		}
	}

	if (CON1.timeouts.status_ignition_new === null) {
		log.module({
			src : module_name,
			msg : 'Set ignition status timeout',
		});
	}

	CON1.timeouts.status_ignition_new = setTimeout(send_status_ignition_new, 1000);
}

// Parse data sent from module
function parse_out(data) {
	switch (data.src.id) {
		case 0x202:
			data.command = 'bro';
			data.value   = 'Dimmer status';
			decode_backlight(data);
			break; // Backlight message

		case 0x264:
			data.command = 'con';
			data.value   = 'rotation';
			decode_con_rotation(data);
			break;

		case 0x267:
			data.command = 'con';
			data.value   = 'button press';
			decode_con_button(data);
			break;

		case 0x273:
			data.command = 'con';
			data.value   = 'CIC init iDrive knob';
			decode_status_cic(data);
			break; // Used for iDrive knob rotational initialization

		case 0x277:
			data.command = 'rep';
			data.value   = module_name+' ACK to CIC init';
			break; // CON ACK to rotational initialization message

		case 0x4F8:
			data.command = 'bro';
			data.value   = 'Ignition status';
			decode_ignition_new(data);
			break;

		case 0x4E7:
			decode_status_con(data);
			return;
			data.command = 'sta';
			data.value   = module_name+' status';
			break;

		case 0x5E7:
			decode_status_con(data);
			return;
			data.command = 'sta';
			data.value   = module_name+' counter';
			break;

		default:
			data.command = 'unk';
			data.value   = Buffer.from(data.msg);
	}

	// log.bus(data);
}


module.exports = {
	timeouts : {
		status_cic          : null,
		status_ignition_new : null,
	},

	// Functions
	parse_out : (data) => { parse_out(data); },

	send_backlight           : (value) => { send_backlight(value);      },
	send_status_ignition_new : ()      => { send_status_ignition_new(); },
};
