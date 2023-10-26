import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import yaml from "js-yaml";
import * as fs from "fs";

const stack = pulumi.getStack();
const configFile = fs.readFileSync(`Pulumi.${stack}.yaml`, 'utf8');
const config = yaml.safeLoad(configFile);

// Creating VPC
const myvpc = new aws.ec2.Vpc(config.config['iac-pulumi:vpc_name'], {
    cidrBlock: config.config['iac-pulumi:vpc_cidrBlock'],
    tags: {
        Name: config.config['iac-pulumi:vpc_name'],
    },
});

// Creating subnet 

// Create public subnets
const iam_publicSubnets = [];
const iam_privateSubnets = [];
const available = aws.getAvailabilityZones({
    state: "available",
});

available.then(available => {
    
    const zoneCount = Math.min((available.names?.length || 0),parseInt(config.config['iac-pulumi:no_of_max_subnets']));
    const arr = config.config['iac-pulumi:sub_cidr'].split(".");
    for (let i = 0; i < zoneCount; i++) {
        // Create public subnets
        
        const subpubName = config.config['iac-pulumi:public_subnet_name'] + i;
        console.log(subpubName)
        const subpubCidr = arr[0] + "." + arr[1] + "." + i + "." + arr[3];
        const publicsubnet = new aws.ec2.Subnet(subpubName, {
            vpcId: myvpc.id,
            availabilityZone: available.names?.[i],
            cidrBlock: subpubCidr,
            mapPublicIpOnLaunch: true,
            tags: {
                Name: subpubName,
            },
        });

        iam_publicSubnets.push(publicsubnet);

        const host = i + zoneCount
        // Create private subnets
        const subpriCidr = arr[0] + "." + arr[1] + "." + host + "." + arr[3];
        const subPrivateName = config.config['iac-pulumi:private_subnet_name'] + i;
        const privatesubnet = new aws.ec2.Subnet(subPrivateName, {
            vpcId: myvpc.id,
            availabilityZone: available.names?.[i],
            cidrBlock: subpriCidr,
            tags: {
                Name: subPrivateName,
            },
        });

        iam_privateSubnets.push(privatesubnet);
    }

    // Creating internet gateway
    const internet = new aws.ec2.InternetGateway(config.config['iac-pulumi:internet_gateway_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:internet_gateway_name'],
        },
    });

    // Create a public route table
    const publicRouteTable = new aws.ec2.RouteTable(config.config['iac-pulumi:public_route_table_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:public_route_table_name'],
        },
    });

    // Attach all public subnets to the public route table
    iam_publicSubnets.forEach((subnet, index) => {
        let pubAssociationNmae = config.config['iac-pulumi:public_association_name'] + index
        const routeTable = new aws.ec2.RouteTableAssociation(pubAssociationNmae, {
            routeTableId: publicRouteTable.id,
            subnetId: subnet.id,
        });
    });

    // Create a private route table
    const privRouteTable = new aws.ec2.RouteTable(config.config['iac-pulumi:private_route_table_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:private_route_table_name'],
        },
    });

    // Attach all private subnets to the private route table
    iam_privateSubnets.forEach((subnet, index) => {
        let priAssociationNmae = config.config['iac-pulumi:private_association_name'] + index
        const routeTable = new aws.ec2.RouteTableAssociation(priAssociationNmae, {
            routeTableId: privRouteTable.id,
            subnetId: subnet.id,
        });
    });

    const publicRoute = new aws.ec2.Route(config.config['iac-pulumi:public_route_name'], {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: config.config['iac-pulumi:route_to_internet'],
        gatewayId: internet.id,
        tags: {
            Name: config.config['iac-pulumi:public_route_name'],
        },
    });

    // Create an EC2 security group for web applications
    const appSecurityGroup = new aws.ec2.SecurityGroup(config.config['iac-pulumi:security_group_name'], {
    vpcId: myvpc.id,
    description: "Security group for web applications",
    ingress: [
      {
        fromPort: config.config['iac-pulumi:ssh_from_port'], //SSH
        toPort: config.config['iac-pulumi:ssh_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:ssh_ip']], 
      },
      {
        fromPort: config.config['iac-pulumi:http_from_port'], //HTTP
        toPort: config.config['iac-pulumi:http_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
        ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']], 
      },
      {
        fromPort: config.config['iac-pulumi:https_from_port'], //HTTPS
        toPort: config.config['iac-pulumi:https_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
        ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']], 
      },
      {
        fromPort: config.config['iac-pulumi:your_from_port'], //your port
        toPort: config.config['iac-pulumi:your_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
        ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']], 
      },
    ],
    egress: [
        {
            protocol: config.config['iac-pulumi:int_protocol'], 
            fromPort: config.config['iac-pulumi:int_fromPort'],
            toPort: config.config['iac-pulumi:int_toPort'],
            cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],   
        },
    ],
    tags: {
        Name: config.config['iac-pulumi:security_group_name'],
    },
  });

  const ami = aws.ec2.getAmi({
    filters: [
        {
            name: config.config['iac-pulumi:ami_name'],
            values: [config.config['iac-pulumi:ami_name_value']],
        },
        {
            name: config.config['iac-pulumi:root_device_type_tag'],
            values: [config.config['iac-pulumi:root_device_type_tag_value']],
        },
        {
            name: config.config['iac-pulumi:virtualization_tag'],
            values: [config.config['iac-pulumi:virtualization_tag_value']],
        },
    ],
    mostRecent: true,
    owners: [config.config['iac-pulumi:owner']],
});

// const instance = new aws.ec2.Instance(config.config['iac-pulumi:instance_tag'], {
//     ami: ami.then(i => i.id),
//     instanceType: config.config['iac-pulumi:instance_type'],
//     subnetId: iam_publicSubnets[0],
//     keyName: config.config['iac-pulumi:key_value'],
//     associatePublicIpAddress: true,
//     vpcSecurityGroupIds: [
//         appSecurityGroup.id,
//     ]

// });
  //rds parameter group

  const rdsParameterGroup = new aws.rds.ParameterGroup("rds-parameter-group", {
    vpcId: myvpc.id,
    description: "Custom parameter group for csye6225",
family: "mysql8.0",
parameters: [
    {
        name: "character_set_server",
        value: "utf8"
    },
]
 
});

const privateGroup = iam_privateSubnets.map(subnet => subnet.id)
//RDS Subnet Group
const rdsSubnetGroup = new aws.rds.SubnetGroup(config.config['iac-pulumi:rds_subnet_group_name'], {
    subnetIds: privateGroup,
    description: "Subnet group for RDS instance",
    tags: {
        Name: config.config['iac-pulumi:rds_subnet_group_name'],
    },
});

//RDS Security Group
const rdsSecurityGroup = new aws.ec2.SecurityGroup(config.config['iac-pulumi:db_security_group_name'],{
    vpcId: myvpc.id,
    description: "RDS database security group",
    ingress: [
        {   
            fromPort: config.config['iac-pulumi:db_to_port'], //your port
            toPort: config.config['iac-pulumi:db_to_port'],
            protocol: config.config['iac-pulumi:protocol'],
            // protocol: "tcp", // Use TCP for database
            // fromPort: config.config("iac-pulumi:db_from_port"),
            // toPort: config.config("iac-pulumi:db_to_port"),

            securityGroups: [appSecurityGroup.id], // Reference to the application security group
        },
    ],
    egress: [
        {
            protocol: config.config['iac-pulumi:int_protocol'], 
            fromPort: config.config['iac-pulumi:int_fromPort'],
            toPort: config.config['iac-pulumi:int_toPort'],
            cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],   
        },
    ],
    
});


const rdsInstance = new aws.rds.Instance(config.config["iac-pulumi:db_instance_name"], {
    allocatedStorage: config.config['iac-pulumi:db_allocated_storage'],
    storageType: config.config['iac-pulumi:db_storage_type'],
    engine: config.config['iac-pulumi:db_engine'],
    engineVersion: config.config['iac-pulumi:db_engine_version'],
    skipFinalSnapshot: config.config['iac-pulumi:db_skip_final_snapshot'],
    instanceClass: config.config['iac-pulumi:db_instance_class'],
    multiAz: config.config['iac-pulumi:multi_az'],
    dbName: config.config['iac-pulumi:db_name'],
    username: config.config['iac-pulumi:username'],
    password: config.config['iac-pulumi:password'],
    parameterGroupName: config.config ['db_parameter_group_name'],
    dbSubnetGroupName: rdsSubnetGroup.name,
    vpcSecurityGroupIds: [rdsSecurityGroup.id],
    publiclyAccessible: config.config['iac-pulumi:publiclyAccessible'],
})

rdsInstance.endpoint.apply(endpoint => {
    const envFile = config.config['iac-pulumi:db_env_path']
    const instance = new aws.ec2.Instance(config.config['iac-pulumi:instance_tag'], {
        ami: ami.then(i => i.id),
        instanceType: config.config['iac-pulumi:instance_type'],
        subnetId: iam_publicSubnets[0],
        keyName: config.config['iac-pulumi:key_value'],
        associatePublicIpAddress: true,
        vpcSecurityGroupIds: [
            appSecurityGroup.id,
        ],
        userData: pulumi.interpolate`#!/bin/bash
            echo "host=${endpoint}" >> ${envFile}
            echo "user=${config.config['iac-pulumi:username']}" >> ${envFile}
            echo "password=${config.config['iac-pulumi:password']}" >> ${envFile}
            echo "port=${config.config['iac-pulumi:db_port']}" >> ${envFile}
            echo "dialect=${config.config['iac-pulumi:db_dialect']}" >> ${envFile}
            echo "database=${config.config['iac-pulumi:db_name']}" >> ${envFile}`



    });
});
});
