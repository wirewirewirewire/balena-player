## vlc player with balena for amd64 und arm

<img alt="Image of the balena-vlc Player" src="https://user-images.githubusercontent.com/3281586/261872653-1551361f-9b94-4c66-a3a2-7252f0688e7c.png" width="600"/>

TODO: Add Link to Balena Brick

This is a simple skeleton Express server project that works on any of the [balena][balena-link] supported devices.

### Installation on a multicontainer setup

If you want to use `balena-player` in a multi container setup please add [this service](https://github.com/wirewirewirewire/balena-player/blob/vlc/docker-compose.yml) to your docker-compose.

```bash
version: "2"
volumes:
  workdir:
  xserver:
services:
  balena-player:
    build: .
    network_mode: host # host is only needed if you use the UDP broadcast feature
    ports:
      - 6666:6666
    volumes:
      - "workdir:/usr/src/app/media" # drive to mount the media to play
      - "xserver:/tmp/.X11-unix" # external xserver
    privileged: true
    devices:
      - /dev/dri
    group_add:
      - video
    labels:
      io.resin.features.dbus: "1"
      io.resin.features.kernel-modules: "1"
      io.resin.features.firmware: "1"
      io.balena.features.supervisor-api: "1"
  xserver:
    image: gh_smarthomeagentur/xserver-aarch64 # x-server image. it may need to match your architecture
    restart: always
    privileged: true
    volumes:
      - "xserver:/tmp/.X11-unix"
```

An external [X-Server](https://github.com/wirewirewirewire/xserver) is also required. TODO: A full example can be found [here](#). You may need to edit the ARCH of x-server if you use intel or arm.

To get this project up and running, you will need to signup for a balena account [here][signup-page] and set up an application and device. You'll find full details in our [Getting Started tutorial][gettingstarted-link].

Setup you docker-compose and add the following sample [docker-compose]([https://github.com/wirewirewirewire/balena-player/blob/vlc/docker-compose.yml).

#### Push to 
Once you have downloaded this project, you can `balena push` it using the [balenaCLI][balena-cli]. This command will package up and push the code to the balena builders, where it will be compiled and built and deployed to every device in the application fleet. When it completes, you'll have a node.js web server running on your device and see some logs on your [balenaCloud dashboard][balena-dashboard].

To give your device a public URL, access the device page on the [balenaCloud dashboard][balena-dashboard], and choose the _Public Device URL_ toggle. Alternatively, you can point your browser to your device's IP address.

[balena-link]: https://balena.io/
[signup-page]: https://dashboard.balena-cloud.com/signup
[gettingstarted-link]: http://balena.io/docs/learn/getting-started/
[balena-cli]: https://www.balena.io/docs/reference/cli/
[balena-dashboard]: https://dashboard.balena-cloud.com/

### Functions

All functions can be used in the loop that gets parsed by the balena-player. You will find examples below. 

> `await vlcPlayFile(<filePath>)`

Play a file once and wait until the file has finished or the player got killed by another source

> `await vlcPlayFileLoop(<filePath>)`

Play a file in a loop. The main function will never continue form here until the player gets killed by an external source.

> `vlcKill()`

Exits the `vlcPlayFile()` or `vlcPlayFileLoop()`. If it is executed outside the main loop, the loop may continues after the player exits.

> `vlcSettings(<rotation>, <volume>, <audio>)`

**rotation**: any number between 0 and 359. Rotates the video output this degree. DEFAULT: 0

**volume**: any number between 0 and 100. Sets the audio volume of the video. DEFAULT: 100

**audio**: true or false. Sets if audio output is enabled. DEFAULT: false

> `RestartMain()`

Restarts the main function from the beginning (loop). If you dont place this at the end of the main function it will end after executing once.

> `getFileById(<ID>)`

returns a file path from a id that is shown in the config frontend

TODO: how to make this more universal?

> `getIdByFile(<filePath>)`

returns a ID of a file path. Opposite of `getFileById()`.

### Examples

#### play in a loop

Sets the video output to 90 degree rotation (most time this means portrait mode) and plays the file with the ID 43. After its done it will repeat the loop. Replace the ID by the file number in the `Files` repeater.
```
await this.vlcSettings(90);
await this.vlcPlayFile(this.getFileById(43));
this.RestartMain();
```

### UDP Time Broadcast

The player is able to broadcast its position and also the server time to the network via UDP. This can be helpful to sync with a external audio source.

TODO: Add UDP doku
